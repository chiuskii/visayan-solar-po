"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type StockType } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertNoNegativeStock, NegativeStockError, onHandByMaterial } from "@/lib/inventory";
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

  const error = await transaction(async (conn) => {
    const ids = [...totals.keys()];
    // Lock the materials so two people issuing at once can't take the same stock.
    const mats = await query<{ id: number; name: string; unit: string }>(
      "SELECT id, name, unit FROM materials WHERE id IN (?) FOR UPDATE",
      [ids],
      conn,
    );
    if (mats.length !== ids.length) return "One of the materials no longer exists.";
    const onHand = await onHandByMaterial(ids, conn);
    for (const m of mats) {
      const have = onHand.get(m.id) ?? 0;
      if (totals.get(m.id)! > have) return `Only ${have} ${m.unit} of “${m.name}” on hand.`;
    }
    await execute(
      "INSERT INTO stock_movements (material_id, type, quantity, movement_date, client_id, reference, notes, created_by_id) VALUES ?",
      [[...totals].map(([materialId, qty]) => [materialId, "ISSUE", -qty, movementDate, clientId, reference, notes, user.id])],
      conn,
    );
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect("/inventory?saved=issue");
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

  const error = await transaction(async (conn) => {
    const mat = await queryOne("SELECT id FROM materials WHERE id = ? FOR UPDATE", [materialId], conn);
    if (!mat) return "That material no longer exists.";
    const have = (await onHandByMaterial([materialId], conn)).get(materialId) ?? 0;
    const diff = round2(mode === "set" ? quantity - have : quantity);
    if (diff === 0) return mode === "set" ? `On hand is already ${have}. Nothing to change.` : "Enter an amount to add or remove.";
    if (round2(have + diff) < 0) return `That would leave ${round2(have + diff)} on hand. Only ${have} is in stock.`;
    await execute(
      "INSERT INTO stock_movements SET ?",
      [
        toRow("stock_movements", {
          materialId,
          type: "ADJUST",
          quantity: diff,
          movementDate,
          reference: mode === "set" ? `Count: ${quantity}` : null,
          notes,
          createdById: user.id,
        }),
      ],
      conn,
    );
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory");
  redirect(`/inventory/${materialId}?saved=adjust`);
}

/** Removes a mistaken issue or adjustment. Receipts are removed by deleting the PO delivery instead. */
export async function deleteMovement(id: number, materialId: number, _fd: FormData) {
  await requireAdmin();
  const m = await queryOne<{ type: StockType }>("SELECT type FROM stock_movements WHERE id = ? AND material_id = ?", [id, materialId]);
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
