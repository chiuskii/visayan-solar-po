"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type StockType } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertNoNegativeStock, NegativeStockError, onHandByMaterial, recordAdjustment } from "@/lib/inventory";
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
 * Admin: cancels a job order and puts its materials back in stock. Its movements are removed; any
 * already folded into an opening balance (log cleared since) are returned with an adjustment.
 */
export async function cancelJobOrder(id: number, _fd: FormData) {
  const user = await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  await transaction(async (conn) => {
    const jo = await queryOne<{ joNumber: string; status: string }>(
      "SELECT jo_number AS joNumber, status FROM job_orders WHERE id = ? FOR UPDATE",
      [id],
      conn,
    );
    if (!jo || jo.status === "CANCELLED") return;
    const items = await query<{ materialId: number | null; quantity: number }>(
      "SELECT material_id AS materialId, quantity FROM job_order_items WHERE job_order_id = ?",
      [id],
      conn,
    );
    const moved = await query<{ materialId: number; qty: number }>(
      "SELECT material_id AS materialId, -SUM(quantity) AS qty FROM stock_movements WHERE job_order_id = ? GROUP BY material_id",
      [id],
      conn,
    );
    const stillLogged = new Map(moved.map((m) => [m.materialId, Number(m.qty)]));
    await execute("DELETE FROM stock_movements WHERE job_order_id = ?", [id], conn);
    const returns = items
      .filter((i) => i.materialId !== null)
      .map((i) => [i.materialId!, round2(i.quantity - (stillLogged.get(i.materialId!) ?? 0))] as const)
      .filter(([, qty]) => qty > 0);
    if (returns.length) {
      await execute(
        "INSERT INTO stock_movements (material_id, type, quantity, movement_date, reference, notes, created_by_id) VALUES ?",
        [returns.map(([materialId, qty]) => [materialId, "ADJUST", qty, today, jo.joNumber, `Job order ${jo.joNumber} cancelled`, user.id])],
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
  const quantity = round2(parsed.data.quantity);
  if (mode === "set" && quantity < 0) return { error: "A counted quantity can’t be negative." };

  const error = await recordAdjustment({ materialId, mode, quantity, movementDate, notes, createdById: user.id });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/${materialId}?saved=adjust`);
}

/**
 * Admin: clears the movement log but keeps stock. Every material's current on-hand quantity
 * becomes one "Opening balance" adjustment; all other movements are deleted.
 */
export async function clearMovementLog(_fd: FormData) {
  const user = await requireAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  await transaction(async (conn) => {
    // Lock the log so nothing is added while it's being replaced.
    await query("SELECT id FROM stock_movements FOR UPDATE", [], conn);
    const balances = await query<{ materialId: number; qty: number }>(
      "SELECT material_id AS materialId, SUM(quantity) AS qty FROM stock_movements GROUP BY material_id HAVING SUM(quantity) <> 0",
      [],
      conn,
    );
    const lastDelivery = await queryOne<{ id: number | null }>("SELECT MAX(id) AS id FROM deliveries", [], conn);
    await execute("DELETE FROM stock_movements", [], conn);
    if (balances.length) {
      await execute(
        "INSERT INTO stock_movements (material_id, type, quantity, movement_date, reference, notes, created_by_id) VALUES ?",
        [balances.map((b) => [b.materialId, "ADJUST", b.qty, today, "Opening balance", `Movement log cleared by ${user.name}`, user.id])],
        conn,
      );
    }
    await execute(
      "UPDATE company_settings SET stock_cleared_delivery_id = GREATEST(stock_cleared_delivery_id, ?) WHERE id = 1",
      [lastDelivery?.id ?? 0],
      conn,
    );
  });
  revalidatePath("/inventory");
  redirect("/inventory?saved=cleared");
}

/** Removes a mistaken adjustment (or an older assignment without a job order). Receipts are removed by deleting the PO delivery instead. */
export async function deleteMovement(id: number, materialId: number, _fd: FormData) {
  await requireAdmin();
  const m = await queryOne<{ type: StockType; jobOrderId: number | null }>(
    "SELECT type, job_order_id AS jobOrderId FROM stock_movements WHERE id = ? AND material_id = ?",
    [id, materialId],
  );
  // Assignments belong to a job order: cancel the job order instead, so it and the stock stay in step.
  if (m?.jobOrderId) redirect(`/inventory/${materialId}?error=job-order`);
  if (m && m.type !== "RECEIVE") {
    try {
      await transaction(async (conn) => {
        await execute("DELETE FROM stock_movements WHERE id = ?", [id], conn);
        await assertNoNegativeStock([materialId], conn);
      });
    } catch (e) {
      if (e instanceof NegativeStockError) redirect(`/inventory/${materialId}?error=negative`);
      throw e;
    }
  }
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${materialId}`);
}
