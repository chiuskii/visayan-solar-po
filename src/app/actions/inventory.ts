"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type StockType } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertNoNegativeStock, NegativeStockError, onHandByMaterial, recordAdjustment, recordCount } from "@/lib/inventory";
import { nextJoNumber } from "@/lib/job-orders";
import { round2 } from "@/lib/po";

export type FormState = { error?: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date.");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const issueSchema = z.object({
  clientId: z.union([z.literal(""), z.coerce.number().int().positive()]).transform((v) => (v === "" ? null : v)),
  movementDate: dateStr,
  reference: optText(120),
  notes: optText(2000),
  lines: z
    .array(z.object({ materialId: z.number().int().positive("Pick a material on each line."), quantity: z.number().positive("Quantity must be more than 0.") }))
    .min(1, "Add at least one material."),
});

/** Takes materials out of stock for a client / project. Refuses to go below what's on hand. */
export async function issueStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  let lines: unknown = [];
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    lines = [];
  }
  const parsed = issueSchema.safeParse({
    clientId: formData.get("clientId") ?? "",
    movementDate: formData.get("movementDate") ?? "",
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
    lines,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { clientId, movementDate, reference, notes } = parsed.data;
  if (!clientId && !reference) return { error: "Choose the client/project, or enter a reference for where it went." };

  // Same material on two lines → one total.
  const totals = new Map<number, number>();
  for (const l of parsed.data.lines) totals.set(l.materialId, round2((totals.get(l.materialId) ?? 0) + l.quantity));

  // Creates the job order and its stock movements together; returns its id, or an error message.
  const result = await transaction(async (conn): Promise<{ error: string } | { joId: number }> => {
    const ids = [...totals.keys()];
    // Lock the materials so two people issuing at once can't take the same stock.
    const mats = await query<{ id: number; name: string; spec: string | null; unit: string }>(
      "SELECT id, name, spec, unit FROM materials WHERE id IN (?) FOR UPDATE",
      [ids],
      conn,
    );
    if (mats.length !== ids.length) return { error: "One of the materials no longer exists." };
    const onHand = await onHandByMaterial(ids, conn);
    for (const m of mats) {
      const have = onHand.get(m.id) ?? 0;
      if (totals.get(m.id)! > have) return { error: `Only ${have} ${m.unit} of “${m.name}” on hand.` };
    }
    const joNumber = await nextJoNumber(movementDate, conn);
    const jo = await execute(
      "INSERT INTO job_orders SET ?",
      [toRow("job_orders", { joNumber, clientId, joDate: movementDate, reference, notes, createdById: user.id })],
      conn,
    );
    const joId = jo.insertId;
    const byId = new Map(mats.map((m) => [m.id, m]));
    await execute(
      "INSERT INTO job_order_items (job_order_id, material_id, description, spec, unit, quantity, sort_order) VALUES ?",
      [[...totals].map(([materialId, qty], n) => [joId, materialId, byId.get(materialId)!.name, byId.get(materialId)!.spec, byId.get(materialId)!.unit, qty, n])],
      conn,
    );
    await execute(
      "INSERT INTO stock_movements (material_id, type, quantity, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
      [[...totals].map(([materialId, qty]) => [materialId, "ISSUE", -qty, movementDate, clientId, joId, reference ?? joNumber, notes, user.id])],
      conn,
    );
    return { joId };
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/inventory");
  redirect(`/inventory/job-orders/${result.joId}?saved=created`);
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
    // Still out = what the job order issued, less what has been returned. Based on the job order's
    // items, so it's right even for job orders whose ISSUE rows were removed by an old log clear.
    const out = await query<{ materialId: number; qty: number; cost: number | null }>(
      `SELECT i.material_id AS materialId,
              SUM(i.quantity) - COALESCE((SELECT SUM(r.quantity) FROM stock_movements r
                                          WHERE r.job_order_id = ? AND r.material_id = i.material_id AND r.type = 'RETURN'), 0) AS qty,
              COALESCE((SELECT MAX(x.unit_cost) FROM stock_movements x
                        WHERE x.job_order_id = ? AND x.material_id = i.material_id AND x.type = 'ISSUE'), m.default_cost) AS cost
       FROM job_order_items i JOIN materials m ON m.id = i.material_id
       WHERE i.job_order_id = ?
       GROUP BY i.material_id, m.default_cost
       HAVING qty > 0`,
      [id, id, id],
      conn,
    );
    if (out.length) {
      await execute(
        "INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, client_id, job_order_id, reference, notes, created_by_id) VALUES ?",
        [out.map((o) => [o.materialId, "RETURN", round2(Number(o.qty)), o.cost, today, jo.clientId, id, jo.joNumber, `Job order ${jo.joNumber} cancelled`, user.id])],
        conn,
      );
    }
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
