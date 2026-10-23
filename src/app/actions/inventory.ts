"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type StockType } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertNoNegativeStock, NegativeStockError, onHandByMaterial, recordAdjustment, recordCount } from "@/lib/inventory";
import { jobOrderMaterials, nextJoNumber } from "@/lib/job-orders";
import { round2 } from "@/lib/po";

export type FormState = { error?: string; ok?: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date.");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const linesSchema = z
  .array(z.object({ materialId: z.number().int().positive("Pick a material on each line."), quantity: z.number().positive("Quantity must be more than 0.") }))
  .min(1, "Add at least one material.");

function readLines(formData: FormData): unknown {
  try {
    return JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return [];
  }
}

/** Same material on two lines → one total. */
function totalsOf(lines: { materialId: number; quantity: number }[]) {
  const totals = new Map<number, number>();
  for (const l of lines) totals.set(l.materialId, round2((totals.get(l.materialId) ?? 0) + l.quantity));
  return totals;
}

type LockedMaterial = { id: number; name: string; spec: string | null; unit: string; defaultCost: number };

/**
 * Locks the materials (so two people issuing at once can't take the same stock) and checks there's
 * enough on hand. Returns them, or an error message.
 */
async function lockStock(totals: Map<number, number>, conn: PoolConnection): Promise<{ error: string } | { mats: Map<number, LockedMaterial> }> {
  const ids = [...totals.keys()];
  const mats = await query<LockedMaterial>("SELECT id, name, spec, unit, default_cost AS defaultCost FROM materials WHERE id IN (?) FOR UPDATE", [ids], conn);
  if (mats.length !== ids.length) return { error: "One of the materials no longer exists." };
  const onHand = await onHandByMaterial(ids, conn);
  for (const m of mats) {
    const have = onHand.get(m.id) ?? 0;
    if (totals.get(m.id)! > have) return { error: `Only ${have} ${m.unit} of “${m.name}” on hand.` };
  }
  return { mats: new Map(mats.map((m) => [m.id, m])) };
}

/**
 * Adds materials to an open job order: materials already on it get a bigger quantity, new ones become
 * new lines, and the stock goes out as ISSUE movements. Call inside a transaction, with the job order
 * locked and the stock checked by lockStock.
 */
async function appendToJo(
  jo: { id: number; joNumber: string; clientId: number | null; reference: string | null },
  totals: Map<number, number>,
  mats: Map<number, LockedMaterial>,
  a: { movementDate: string; reference: string | null; notes: string | null; userId: number },
  conn: PoolConnection,
) {
  // The client's price stays as it is on the job order; new lines are priced at the material's cost now.
  const existing = await query<{ id: number; materialId: number; unitCost: number }>(
    `SELECT MIN(id) AS id, material_id AS materialId, MIN(unit_cost) AS unitCost
     FROM job_order_items WHERE job_order_id = ? AND material_id IN (?) GROUP BY material_id`,
    [jo.id, [...totals.keys()]],
    conn,
  );
  const lineOf = new Map(existing.map((e) => [e.materialId, e.id]));
  const priceOf = new Map(existing.map((e) => [e.materialId, Number(e.unitCost)]));
  let sort = Number((await queryOne<{ n: number | null }>("SELECT MAX(sort_order) AS n FROM job_order_items WHERE job_order_id = ?", [jo.id], conn))?.n ?? -1);
  for (const [materialId, qty] of totals) {
    const lineId = lineOf.get(materialId);
    if (lineId) {
      await execute("UPDATE job_order_items SET quantity = quantity + ? WHERE id = ?", [qty, lineId], conn);
    } else {
      const m = mats.get(materialId)!;
      await execute(
        "INSERT INTO job_order_items SET ?",
        [toRow("job_order_items", { jobOrderId: jo.id, materialId, description: m.name, spec: m.spec, unit: m.unit, quantity: qty, unitCost: m.defaultCost, sortOrder: ++sort })],
        conn,
      );
      priceOf.set(materialId, m.defaultCost);
    }
  }
  await execute(
    "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
    [[...totals].map(([materialId, qty]) => [
      materialId, "ISSUE", -qty, priceOf.get(materialId), a.movementDate, jo.clientId, jo.id, a.reference ?? jo.reference ?? jo.joNumber, a.notes, a.userId,
    ])],
    conn,
  );
}

/**
 * Takes materials out of stock for a client / project. Refuses to go below what's on hand.
 * Each client has one open job order: the materials are added to it, and it's created the first time
 * (or after the client's job order was cancelled). Assignments without a client get their own job order.
 */
export async function issueStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({
      clientId: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v)),
      movementDate: dateStr,
      reference: optText(120),
      notes: optText(2000),
      lines: linesSchema,
    })
    .safeParse({
      clientId: formData.get("clientId") ?? "",
      movementDate: formData.get("movementDate") ?? "",
      reference: formData.get("reference") ?? "",
      notes: formData.get("notes") ?? "",
      lines: readLines(formData),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { clientId, movementDate, reference, notes } = parsed.data;
  if (!clientId && !reference) return { error: "Choose the client/project, or enter a reference for where it went." };
  const totals = totalsOf(parsed.data.lines);

  // Adds to the client's job order (or creates it) together with the stock movements.
  const result = await transaction(async (conn): Promise<{ error: string } | { joId: number; added: boolean }> => {
    if (clientId) {
      // Lock the client first, so two people assigning to the same client at once can't both create a job order.
      if (!(await queryOne("SELECT id FROM clients WHERE id = ? FOR UPDATE", [clientId], conn))) return { error: "That client no longer exists." };
    }
    const locked = await lockStock(totals, conn);
    if ("error" in locked) return locked;
    const open = clientId
      ? await queryOne<{ id: number; joNumber: string; clientId: number | null; reference: string | null }>(
          `SELECT id, jo_number AS joNumber, client_id AS clientId, reference FROM job_orders
           WHERE client_id = ? AND status = 'ISSUED' ORDER BY jo_date DESC, id DESC LIMIT 1 FOR UPDATE`,
          [clientId],
          conn,
        )
      : undefined;
    if (open) {
      await appendToJo(open, totals, locked.mats, { movementDate, reference, notes, userId: user.id }, conn);
      return { joId: open.id, added: true };
    }
    const joNumber = await nextJoNumber(movementDate, conn);
    const jo = await execute(
      "INSERT INTO job_orders SET ?",
      [toRow("job_orders", { joNumber, clientId, joDate: movementDate, reference, notes, createdById: user.id })],
      conn,
    );
    const joId = jo.insertId;
    await execute(
      "INSERT INTO job_order_items (job_order_id, material_id, description, spec, unit, quantity, unit_cost, sort_order) VALUES ?",
      [[...totals].map(([materialId, qty], n) => {
        const m = locked.mats.get(materialId)!;
        return [joId, materialId, m.name, m.spec, m.unit, qty, m.defaultCost, n];
      })],
      conn,
    );
    await execute(
      "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
      [[...totals].map(([materialId, qty]) => [
        materialId, "ISSUE", -qty, locked.mats.get(materialId)!.defaultCost, movementDate, clientId, joId, reference ?? joNumber, notes, user.id,
      ])],
      conn,
    );
    return { joId, added: false };
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${result.joId}?saved=${result.added ? "added" : "created"}`);
}

/** Adds more materials to an existing job order: out of stock, onto the same job order and client. */
export async function addToJobOrder(joId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({ movementDate: dateStr, notes: optText(2000), lines: linesSchema })
    .safeParse({ movementDate: formData.get("movementDate") ?? "", notes: formData.get("notes") ?? "", lines: readLines(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { movementDate, notes } = parsed.data;
  const totals = totalsOf(parsed.data.lines);

  const error = await transaction(async (conn) => {
    const jo = await queryOne<{ joNumber: string; clientId: number | null; reference: string | null; status: string }>(
      "SELECT jo_number AS joNumber, client_id AS clientId, reference, status FROM job_orders WHERE id = ? FOR UPDATE",
      [joId],
      conn,
    );
    if (!jo) return "This job order no longer exists.";
    if (jo.status === "CANCELLED") return "This job order is cancelled. Assign the materials on a new job order.";
    const locked = await lockStock(totals, conn);
    if ("error" in locked) return locked.error;
    await appendToJo({ id: joId, ...jo }, totals, locked.mats, { movementDate, reference: null, notes, userId: user.id }, conn);
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${joId}?saved=added`);
}

/**
 * Records materials coming back from a job order as RETURN movements, at the cost they went out at,
 * so stock goes back up and the project cost goes down. Never more than is still out on it.
 * Call inside a transaction with the job order row locked. Returns an error message, or null.
 */
async function returnFromJo(
  jo: { id: number; joNumber: string; clientId: number | null },
  lines: Map<number, number>,
  movementDate: string,
  notes: string,
  userId: number,
  conn: PoolConnection,
) {
  const out = new Map((await jobOrderMaterials(jo.id, conn)).map((m) => [m.materialId, m]));
  for (const [materialId, qty] of lines) {
    const m = out.get(materialId);
    if (!m) return `That material isn’t on ${jo.joNumber}.`;
    if (qty > m.out) return `Only ${m.out} ${m.unit} of “${m.description}” is still out on ${jo.joNumber}.`;
  }
  if (lines.size) {
    await execute(
      "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
      [[...lines].map(([materialId, qty]) => [materialId, "RETURN", qty, out.get(materialId)!.cost, movementDate, jo.clientId, jo.id, jo.joNumber, notes, userId])],
      conn,
    );
  }
  return null;
}

const returnSchema = z.object({
  movementDate: dateStr,
  notes: z.string().trim().min(1, "Say why they’re being removed (e.g. unused, returned to warehouse, wrong item).").max(2000),
});

/** Removes materials from a job order: they come back into stock (RETURN), up to what's still out. */
export async function returnFromJobOrder(joId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = returnSchema
    .extend({ lines: linesSchema })
    .safeParse({ movementDate: formData.get("movementDate") ?? "", notes: formData.get("notes") ?? "", lines: readLines(formData) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { movementDate, notes } = parsed.data;
  const error = await transaction(async (conn) => {
    const jo = await queryOne<{ joNumber: string; clientId: number | null; status: string }>(
      "SELECT jo_number AS joNumber, client_id AS clientId, status FROM job_orders WHERE id = ? FOR UPDATE",
      [joId],
      conn,
    );
    if (!jo) return "This job order no longer exists.";
    if (jo.status === "CANCELLED") return "This job order is cancelled; its materials are already back in stock.";
    return returnFromJo({ id: joId, ...jo }, totalsOf(parsed.data.lines), movementDate, notes, user.id, conn);
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${joId}?saved=returned`);
}

/**
 * Removes a material from a client: the quantity comes back into stock from the client's job orders,
 * newest first, as RETURN movements on each job order it came from.
 */
export async function returnFromClient(clientId: number, materialId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = returnSchema
    .extend({ quantity: z.coerce.number({ error: "Enter how many to remove." }).positive("Enter how many to remove.") })
    .safeParse({ movementDate: formData.get("movementDate") ?? "", notes: formData.get("notes") ?? "", quantity: formData.get("quantity") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { movementDate, notes } = parsed.data;
  let left = round2(parsed.data.quantity);

  const error = await transaction(async (conn) => {
    const jos = await query<{ id: number; joNumber: string; clientId: number | null }>(
      `SELECT DISTINCT jo.id, jo.jo_number AS joNumber, jo.client_id AS clientId, jo.jo_date
       FROM job_orders jo JOIN job_order_items i ON i.job_order_id = jo.id
       WHERE jo.client_id = ? AND jo.status = 'ISSUED' AND i.material_id = ?
       ORDER BY jo.jo_date DESC, jo.id DESC
       FOR UPDATE`,
      [clientId, materialId],
      conn,
    );
    let available = 0;
    const plan: [(typeof jos)[number], number][] = [];
    for (const jo of jos) {
      const out = (await jobOrderMaterials(jo.id, conn)).find((m) => m.materialId === materialId)?.out ?? 0;
      available = round2(available + out);
      const take = Math.min(out, left);
      if (take > 0) {
        plan.push([jo, round2(take)]);
        left = round2(left - take);
      }
    }
    if (left > 0) return `Only ${available} of that material is still out with this client on job orders.`;
    for (const [jo, qty] of plan) {
      const err = await returnFromJo(jo, new Map([[materialId, qty]]), movementDate, notes, user.id, conn);
      if (err) return err;
    }
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  revalidatePath(`/clients/${clientId}`);
  return { ok: "Removed. The materials are back in stock." };
}

/**
 * Sets the client's price per material on a job order. The job order line and its assignment and return
 * movements get the new price, so the project cost follows. Materials are not changed.
 */
export async function updateJobOrderPrices(joId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("prices") ?? "[]"));
  } catch {
    raw = [];
  }
  const parsed = z
    .array(z.object({ materialId: z.number().int().positive(), unitCost: z.number().min(0, "A price can’t be negative.").max(1e10) }))
    .min(1, "Change at least one price.")
    .safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the prices." };
  const error = await transaction(async (conn) => {
    const jo = await queryOne<{ status: string }>("SELECT status FROM job_orders WHERE id = ? FOR UPDATE", [joId], conn);
    if (!jo) return "This job order no longer exists.";
    if (jo.status === "CANCELLED") return "This job order is cancelled.";
    for (const p of parsed.data) {
      const price = round2(p.unitCost);
      const res = await execute("UPDATE job_order_items SET unit_cost = ? WHERE job_order_id = ? AND material_id = ?", [price, joId, p.materialId], conn);
      if (!res.affectedRows) return "One of the materials isn’t on this job order. Reload the page.";
      await execute(
        "UPDATE stock_movements SET unit_cost = ? WHERE job_order_id = ? AND material_id = ? AND type IN ('ISSUE', 'RETURN')",
        [price, joId, p.materialId],
        conn,
      );
    }
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${joId}?saved=prices`);
}

/**
 * Admin: cancels a job order and puts back in stock whatever is still out on it, as RETURN movements
 * at the cost it went out at. Nothing is deleted, so the history and the project cost (which nets to
 * zero) stay correct.
 */
export async function cancelJobOrder(id: number, _fd: FormData) {
  const user = await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  await transaction(async (conn) => {
    const jo = await queryOne<{ joNumber: string; clientId: number | null; status: string }>(
      "SELECT jo_number AS joNumber, client_id AS clientId, status FROM job_orders WHERE id = ? FOR UPDATE",
      [id],
      conn,
    );
    if (!jo || jo.status === "CANCELLED") return;
    const out = (await jobOrderMaterials(id, conn)).filter((m) => m.out > 0);
    await returnFromJo({ id, ...jo }, new Map(out.map((m) => [m.materialId, m.out])), today, `Job order ${jo.joNumber} cancelled`, user.id, conn);
    await execute(
      "UPDATE job_orders SET status = 'CANCELLED', cancelled_by_id = ?, cancelled_at = NOW() WHERE id = ?",
      [user.id, id],
      conn,
    );
  });
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${id}?saved=cancelled`);
}

const adjustSchema = z.object({
  materialId: z.coerce.number().int().positive("Pick a material."),
  mode: z.enum(["set", "change"]),
  quantity: z.coerce.number({ error: "Enter a quantity." }).refine(Number.isFinite, "Enter a quantity."),
  movementDate: dateStr,
  notes: z.string().trim().min(1, "Give a reason (e.g. physical count, damaged, found).").max(2000),
});

/** Sets stock to a counted quantity, or changes it by + / − an amount. */
export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = adjustSchema.safeParse({
    materialId: formData.get("materialId"),
    mode: formData.get("mode"),
    quantity: formData.get("quantity") || undefined,
    movementDate: formData.get("movementDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { materialId, mode, movementDate, notes } = parsed.data;
  if (mode === "change" && user.role !== "ADMIN") {
    return { error: "Only an admin can add or remove stock. Record a count, or receive it through the PO." };
  }
  const quantity = round2(parsed.data.quantity);
  if (mode === "set" && quantity < 0) return { error: "A counted quantity can’t be negative." };

  const error = await recordAdjustment({ materialId, mode, quantity, movementDate, notes, createdById: user.id });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/${materialId}?saved=adjust`);
}

/**
 * Admin: undoes a mistaken adjustment by adding an opposite ADJUST linked to it, with a reason.
 * Nothing is deleted. Assignments are undone by cancelling the job order; receipts by fixing the PO delivery.
 */
export async function reverseMovement(id: number, materialId: number, formData: FormData) {
  const user = await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (!reason) redirect(`/inventory/${materialId}?error=reason`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  let reversedOk = false;
  try {
    reversedOk = await transaction(async (conn) => {
      const m = await queryOne<{ type: StockType; quantity: number; unitCost: number | null; reversalOfId: number | null; movementDate: string }>(
        `SELECT type, quantity, unit_cost AS unitCost, reversal_of_id AS reversalOfId, movement_date AS movementDate
         FROM stock_movements WHERE id = ? AND material_id = ? FOR UPDATE`,
        [id, materialId],
        conn,
      );
      if (!m || m.type !== "ADJUST" || m.reversalOfId) return false;
      if (await queryOne("SELECT id FROM stock_movements WHERE reversal_of_id = ?", [id], conn)) return false;
      await execute(
        "INSERT INTO stock_movements SET ?",
        [
          toRow("stock_movements", {
            materialId,
            type: "ADJUST",
            quantity: -m.quantity,
            unitCost: m.unitCost,
            movementDate: today,
            reversalOfId: id,
            reference: `Reverses ${m.movementDate} adjustment (${m.quantity > 0 ? "+" : ""}${m.quantity})`,
            notes: reason,
            createdById: user.id,
          }),
        ],
        conn,
      );
      await assertNoNegativeStock([materialId], conn);
      return true;
    });
  } catch (e) {
    if (e instanceof NegativeStockError) redirect(`/inventory/${materialId}?error=negative`);
    throw e;
  }
  if (!reversedOk) redirect(`/inventory/${materialId}?error=not-reversible`);
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${materialId}`);
  redirect(`/inventory/${materialId}?saved=reversed`);
}

const countSchema = z.object({
  movementDate: dateStr,
  notes: z.string().trim().min(1, "Enter who counted (and who witnessed it).").max(2000),
  lines: z
    .array(z.object({ materialId: z.number().int().positive(), counted: z.number().min(0, "A counted quantity can’t be negative.") }))
    .min(1, "Enter the counted quantity for at least one material.")
    .max(5000),
});

/** Saves a stock count sheet: sets each counted material to what was counted. Staff may do this. */
export async function saveStockCount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let lines: unknown = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    lines = [];
  }
  const parsed = countSchema.safeParse({ movementDate: formData.get("movementDate") ?? "", notes: formData.get("notes") ?? "", lines });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the count." };
  const res = await recordCount({
    lines: parsed.data.lines.map((l) => ({ materialId: l.materialId, counted: round2(l.counted) })),
    movementDate: parsed.data.movementDate,
    notes: parsed.data.notes,
    createdById: user.id,
  });
  if ("error" in res) return { error: res.error };
  revalidatePath("/inventory");
  redirect(`/inventory/count?counted=${res.counted}&adjusted=${res.adjusted}`);
}

/**
 * Saves the default cost of many materials at once (Inventory → Edit prices). Only Materials change:
 * prices already assigned to clients stay on their job orders.
 */
export async function saveMaterialPrices(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("prices") ?? "[]"));
  } catch {
    raw = [];
  }
  const parsed = z
    .array(z.object({ materialId: z.number().int().positive(), defaultCost: z.number().min(0, "A price can’t be negative.").max(1e10) }))
    .min(1, "Change at least one price.")
    .max(5000)
    .safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the prices." };
  const ids = [...new Set(parsed.data.map((p) => p.materialId))];
  if (ids.length !== parsed.data.length) return { error: "A material is listed twice." };
  const error = await transaction(async (conn) => {
    const found = await query<{ id: number }>("SELECT id FROM materials WHERE id IN (?) FOR UPDATE", [ids], conn);
    if (found.length !== ids.length) return "One of the materials no longer exists. Reload the page.";
    for (const p of parsed.data) {
      await execute("UPDATE materials SET default_cost = ? WHERE id = ?", [round2(p.defaultCost), p.materialId], conn);
    }
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  revalidatePath("/materials");
  redirect(`/inventory/prices?saved=${ids.length}`);
}
