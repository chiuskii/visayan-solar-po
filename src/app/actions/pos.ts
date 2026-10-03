"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, queryOne, transaction } from "@/db";
import { toRow, type PoItem, type PoStatus } from "@/db/types";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertNoNegativeStock, NegativeStockError, syncPoStock } from "@/lib/inventory";
import { getSettings, nextPoNumber, poHasDeliveries, receivedByItem, refreshDeliveryStatus, round2 } from "@/lib/po";

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
  supplierId: z.number({ error: "Choose a supplier for each line." }).int().positive("Choose a supplier for each line."),
  materialId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Each line needs a material/description.").max(255),
  spec: z.string().trim().max(190).optional().default(""),
  unit: z.string().trim().min(1, "Each line needs a unit.").max(30),
  quantity: z.number().positive("Quantity must be more than 0."),
  unitCost: z.number().min(0, "Unit cost can’t be negative."),
});

const poSchema = z.object({
  clientId: z.coerce.number().int().positive("Choose a client."),
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
      toWarehouse: formData.get("toWarehouse") === "on",
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

/** Error message if any line points at a supplier that no longer exists. */
async function checkSuppliers(items: { supplierId: number }[]) {
  const ids = [...new Set(items.map((i) => i.supplierId))];
  const found = await query<{ id: number }>("SELECT id FROM suppliers WHERE id IN (?)", [ids]);
  return found.length === ids.length ? null : "One of the chosen suppliers no longer exists. Pick another.";
}

export async function createPo(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = parsePoForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { items, ...header } = parsed.data;
  const supplierError = await checkSuppliers(items);
  if (supplierError) return { error: supplierError };
  // "order" submits it: straight to ORDERED, or to PENDING when approval is required.
  const { requireApproval } = await getSettings();
  const submit = formData.get("intent") === "order";
  const status = !submit ? "DRAFT" : requireApproval ? "PENDING" : "ORDERED";

  let newId = 0;
  for (let attempt = 0; attempt < 3 && !newId; attempt++) {
    try {
      newId = await transaction(async (conn) => {
        const poNumber = await nextPoNumber(header.poDate);
        const res = await execute(
          "INSERT INTO purchase_orders SET ?",
          [toRow("purchase_orders", { ...header, poNumber, status, createdById: user.id, submittedAt: submit ? new Date() : null })],
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
  const supplierError = await checkSuppliers(items);
  if (supplierError) return { error: supplierError };

  const po = await queryOne<{ status: PoStatus; approvedById: number | null }>(
    "SELECT status, approved_by_id AS approvedById FROM purchase_orders WHERE id = ?",
    [poId],
  );
  if (!po) return { error: "This PO no longer exists." };
  if (po.status === "CANCELLED") return { error: "Reopen this PO before editing it." };
  // Changing an approved PO withdraws the approval: it goes back to the approver.
  const { requireApproval } = await getSettings();
  const needsReapproval = requireApproval && po.approvedById !== null;

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

  // Materials whose stock this edit can change: those on the PO before and after.
  const touched = await query<{ id: number }>(
    "SELECT DISTINCT material_id AS id FROM po_items WHERE po_id = ? AND material_id IS NOT NULL",
    [poId],
  );
  const stockIds = [...new Set([...touched.map((t) => t.id), ...items.map((i) => i.materialId).filter((v): v is number => !!v)])];
  try {
    await transaction(async (conn) => {
      await execute("UPDATE purchase_orders SET ? WHERE id = ?", [toRow("purchase_orders", header), poId], conn);
      if (needsReapproval) {
        await execute(
          "UPDATE purchase_orders SET status = 'PENDING', approved_by_id = NULL, approved_at = NULL, submitted_at = NOW() WHERE id = ?",
          [poId],
          conn,
        );
      }
      const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
      if (toDelete.length) await execute("DELETE FROM po_items WHERE po_id = ? AND id IN (?)", [poId, toDelete], conn);
      for (const { id, ...it } of items) {
        if (id && existingIds.has(id)) {
          await execute("UPDATE po_items SET ? WHERE id = ? AND po_id = ?", [toRow("po_items", it), id, poId], conn);
        } else {
          await execute("INSERT INTO po_items SET ?", [toRow("po_items", { ...it, poId })], conn);
        }
      }
      await syncPoStock(poId, conn);
      await assertNoNegativeStock(stockIds, conn);
    });
  } catch (e) {
    if (e instanceof NegativeStockError) return { error: e.message };
    throw e;
  }
  await refreshDeliveryStatus(poId);
  revalidatePath("/pos");
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/inventory");
  redirect(`/pos/${poId}`);
}

/** Sends a draft on: to the approver (PENDING) when approval is required, otherwise straight to ORDERED. */
export async function submitPo(poId: number, _fd: FormData) {
  await requireUser();
  const { requireApproval } = await getSettings();
  await execute("UPDATE purchase_orders SET status = ?, submitted_at = NOW(), approval_note = NULL WHERE id = ? AND status = 'DRAFT'", [
    requireApproval ? "PENDING" : "ORDERED",
    poId,
  ]);
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
}

/** Approver signs off a PO waiting for approval: it becomes ORDERED with their name, designation and e-signature. */
export async function approvePo(poId: number, _fd: FormData) {
  const user = await requireUser();
  if (!user.canApprove) redirect(`/pos/${poId}?error=not-approver`);
  const po = await queryOne<{ status: PoStatus; createdById: number | null }>(
    "SELECT status, created_by_id AS createdById FROM purchase_orders WHERE id = ?",
    [poId],
  );
  if (!po || po.status !== "PENDING") redirect(`/pos/${poId}`);
  if (po.createdById === user.id) redirect(`/pos/${poId}?error=own-po`);
  const me = await queryOne<{ hasSignature: number }>("SELECT signature IS NOT NULL AS hasSignature FROM users WHERE id = ?", [user.id]);
  if (!Number(me?.hasSignature)) redirect(`/pos/${poId}?error=no-signature`);
  await execute(
    "UPDATE purchase_orders SET status = 'ORDERED', approved_by_id = ?, approved_at = NOW(), approval_note = NULL WHERE id = ? AND status = 'PENDING'",
    [user.id, poId],
  );
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
  redirect(`/pos/${poId}?saved=approved`);
}

/** Approver sends a PO back to draft with a note saying what to change. */
export async function returnPo(poId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.canApprove) return { error: "Only approvers can return a PO." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!note) return { error: "Say what needs to change, so the preparer knows what to fix." };
  const res = await execute(
    "UPDATE purchase_orders SET status = 'DRAFT', approval_note = ?, submitted_at = NULL WHERE id = ? AND status = 'PENDING'",
    [`${note}\n— ${user.name}`, poId],
  );
  if (!res.affectedRows) return { error: "This PO is no longer waiting for approval." };
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
  redirect(`/pos/${poId}?saved=returned`);
}

export async function cancelPo(poId: number, _fd: FormData) {
  await requireUser();
  await execute("UPDATE purchase_orders SET status = 'CANCELLED' WHERE id = ?", [poId]);
  revalidatePath(`/pos/${poId}`);
}

export async function reopenPo(poId: number, _fd: FormData) {
  await requireUser();
  const hasDeliveries = await poHasDeliveries(poId);
  // Without deliveries it goes back to draft and needs submitting (and approving) again.
  await execute(
    `UPDATE purchase_orders SET status = ?${hasDeliveries ? "" : ", approved_by_id = NULL, approved_at = NULL, submitted_at = NULL"}
     WHERE id = ? AND status = 'CANCELLED'`,
    [hasDeliveries ? "ORDERED" : "DRAFT", poId],
  );
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
  if (po.status === "DRAFT") return { error: "Submit this PO before recording deliveries." };
  if (po.status === "PENDING") return { error: "This PO is waiting for approval. Deliveries can be recorded once it’s approved." };
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
    await syncPoStock(poId, conn);
  });
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/pos");
  revalidatePath("/inventory");
  redirect(`/pos/${poId}?saved=delivery`);
}

export async function deleteDelivery(poId: number, deliveryId: number, _fd: FormData) {
  await requireAdmin();
  // Stock received by this delivery is removed with it (stock_movements.delivery_id cascades),
  // unless some of it has already been issued.
  const mats = await query<{ id: number }>(
    "SELECT DISTINCT material_id AS id FROM stock_movements WHERE delivery_id = ?",
    [deliveryId],
  );
  try {
    await transaction(async (conn) => {
      await execute("DELETE FROM deliveries WHERE id = ? AND po_id = ?", [deliveryId, poId], conn);
      await assertNoNegativeStock(mats.map((m) => m.id), conn);
    });
  } catch (e) {
    if (e instanceof NegativeStockError) redirect(`/pos/${poId}?error=stock-issued`);
    throw e;
  }
  await refreshDeliveryStatus(poId);
  revalidatePath(`/pos/${poId}`);
  revalidatePath("/inventory");
}
