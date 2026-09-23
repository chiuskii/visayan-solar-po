"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type PoItem, type PoStatus } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { nextPoNumber, poHasDeliveries, receivedByItem, refreshDeliveryStatus, round2 } from "@/lib/po";

export type FormState = { error?: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const itemSchema = z.object({
  id: z.number().int().positive().optional(),
  materialId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Each line needs a material/description.").max(255),
  spec: z.string().trim().max(190).optional().default(""),
  unit: z.string().trim().min(1, "Each line needs a unit.").max(30),
  quantity: z.number().positive("Quantity must be more than 0."),
  unitCost: z.number().min(0, "Unit cost can’t be negative."),
});

const poSchema = z.object({
  clientId: z.coerce.number().int().positive("Choose a client."),
  supplierId: z.coerce.number().int().positive("Choose a supplier."),
  poDate: dateStr,
  expectedDate: z.union([dateStr, z.literal("")]).transform((v) => v || null),
  deliveryAddress: optText(2000),
  terms: optText(190),
  notes: optText(2000),
  vatRate: z.coerce.number().min(0).max(100),
  discount: z.coerce.number().min(0, "Discount can’t be negative."),
  items: z.array(itemSchema).min(1, "Add at least one material line."),
});

function parsePoForm(formData: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = [];
  }
  const parsed = poSchema.safeParse({
    clientId: formData.get("clientId"),
    supplierId: formData.get("supplierId"),
    poDate: formData.get("poDate") ?? "",
    expectedDate: formData.get("expectedDate") ?? "",
    deliveryAddress: formData.get("deliveryAddress") ?? "",
    terms: formData.get("terms") ?? "",
    notes: formData.get("notes") ?? "",
    vatRate: formData.get("vatRate") ?? 0,
    discount: formData.get("discount") || 0,
    items,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." } as const;
  const d = parsed.data;
  return {
    data: {
      ...d,
      discount: round2(d.discount),
      items: d.items.map((it, i) => ({
        ...it,
        spec: it.spec || null,
        materialId: it.materialId ?? null,
        quantity: round2(it.quantity),
        unitCost: round2(it.unitCost),
        sortOrder: i,
      })),
    },
  } as const;
}

export async function createPo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parsePoForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { items, ...header } = parsed.data;
  const status = formData.get("intent") === "order" ? "ORDERED" : "DRAFT";

  let newId = 0;
  for (let attempt = 0; attempt < 3 && !newId; attempt++) {
    try {
      newId = await transaction(async (conn) => {
        const poNumber = await nextPoNumber(header.poDate);
        const res = await execute(
          "INSERT INTO purchase_orders SET ?",
          [toRow("purchase_orders", { ...header, poNumber, status, createdById: user.id })],
          conn,
        );
        const poId = res.insertId;
        for (const { id: _id, ...it } of items) {
          await execute("INSERT INTO po_items SET ?", [toRow("po_items", { ...it, poId })], conn);
        }
        return poId;
      });
    } catch (e) {
      // Two people saving at the same moment can collide on the PO number; try the next one.
      if (!String((e as Error).message).includes("Duplicate") || attempt === 2) throw e;
    }
  }
  revalidatePath("/pos");
  redirect(`/pos/${newId}`);
}

export async function updatePo(poId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = parsePoForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { items, ...header } = parsed.data;

  const po = await queryOne<{ status: PoStatus }>("SELECT status FROM purchase_orders WHERE id = ?", [poId]);
  if (!po) return { error: "This PO no longer exists." };
  if (po.status === "CANCELLED") return { error: "Reopen this PO before editing it." };

  const existing = await query<{ id: number }>("SELECT id FROM po_items WHERE po_id = ?", [poId]);
  const existingIds = new Set(existing.map((e) => e.id));
  const received = await receivedByItem([...existingIds]);
  const keptIds = new Set(items.filter((i) => i.id && existingIds.has(i.id)).map((i) => i.id!));

  for (const [itemId, qty] of received) {
    if (qty <= 0) continue;
    if (!keptIds.has(itemId)) return { error: "A line that already has deliveries can’t be removed." };
    const it = items.find((i) => i.id === itemId)!;
    if (it.quantity < qty) return { error: `“${it.description}” already has ${qty} received. Quantity can’t be lower than that.` };
  }

  await transaction(async (conn) => {
    await execute("UPDATE purchase_orders SET ? WHERE id = ?", [toRow("purchase_orders", header), poId], conn);
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
    if (toDelete.length) await execute("DELETE FROM po_items WHERE po_id = ? AND id IN (?)", [poId, toDelete], conn);
    for (const { id, ...it } of items) {
      if (id && existingIds.has(id)) {
        await execute("UPDATE po_items SET ? WHERE id = ? AND po_id = ?", [toRow("po_items", it), id, poId], conn);
      } else {
        await execute("INSERT INTO po_items SET ?", [toRow("po_items", { ...it, poId })], conn);
      }
    }
  });
  await refreshDeliveryStatus(poId);
  revalidatePath("/pos");
  revalidatePath(`/pos/${poId}`);
  redirect(`/pos/${poId}`);
}

export async function markOrdered(poId: number, _fd: FormData) {
  await requireUser();
  await execute("UPDATE purchase_orders SET status = 'ORDERED' WHERE id = ? AND status = 'DRAFT'", [poId]);
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
}

export async function cancelPo(poId: number, _fd: FormData) {
  await requireUser();
  await execute("UPDATE purchase_orders SET status = 'CANCELLED' WHERE id = ?", [poId]);
  revalidatePath(`/pos/${poId}`);
}

export async function reopenPo(poId: number, _fd: FormData) {
  await requireUser();
  const hasDeliveries = await poHasDeliveries(poId);
  await execute("UPDATE purchase_orders SET status = ? WHERE id = ? AND status = 'CANCELLED'", [
    hasDeliveries ? "ORDERED" : "DRAFT",
    poId,
  ]);
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
}

export async function deletePo(poId: number, _fd: FormData) {
  await requireAdmin();
  if (await poHasDeliveries(poId)) redirect(`/pos/${poId}?error=has-deliveries`);
  await execute("DELETE FROM purchase_orders WHERE id = ?", [poId]);
  revalidatePath("/pos");
  redirect("/pos");
}

export async function createDelivery(poId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const po = await queryOne<{ status: PoStatus }>("SELECT status FROM purchase_orders WHERE id = ?", [poId]);
  if (!po) return { error: "This PO no longer exists." };
  if (po.status === "DRAFT") return { error: "Mark this PO as ordered before recording deliveries." };
  if (po.status === "CANCELLED") return { error: "This PO is cancelled." };

  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return { error: "Enter the delivery date." };
  const drNumber = String(formData.get("drNumber") ?? "").trim().slice(0, 60) || null;
  const receivedBy = String(formData.get("receivedBy") ?? "").trim().slice(0, 120) || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;

  const items = await query<Pick<PoItem, "id" | "description" | "unit" | "quantity">>(
    "SELECT id, description, unit, quantity FROM po_items WHERE po_id = ?",
    [poId],
  );
  const received = await receivedByItem(items.map((i) => i.id));
  const lines: { poItemId: number; quantity: number }[] = [];
  for (const it of items) {
    const raw = String(formData.get(`qty_${it.id}`) ?? "").trim();
    if (!raw) continue;
    const q = round2(Number(raw));
    if (!Number.isFinite(q) || q < 0) return { error: `Check the quantity for “${it.description}”.` };
    if (q === 0) continue;
    const balance = round2(it.quantity - (received.get(it.id) ?? 0));
    if (q > balance) return { error: `“${it.description}” only has ${balance} ${it.unit} left to receive.` };
    lines.push({ poItemId: it.id, quantity: q });
  }
  if (lines.length === 0) return { error: "Enter the quantity received for at least one line." };

  await transaction(async (conn) => {
    const res = await execute(
      "INSERT INTO deliveries SET ?",
      [toRow("deliveries", { poId, deliveryDate, drNumber, receivedBy, notes, createdById: user.id })],
      conn,
    );
    await execute(
      "INSERT INTO delivery_items (delivery_id, po_item_id, quantity) VALUES ?",
      [lines.map((l) => [res.insertId, l.poItemId, l.quantity])],
      conn,
    );
  });
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
  redirect(`/pos/${poId}?saved=delivery`);
}

export async function deleteDelivery(poId: number, deliveryId: number, _fd: FormData) {
  await requireAdmin();
  await execute("DELETE FROM deliveries WHERE id = ? AND po_id = ?", [deliveryId, poId]);
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
}
