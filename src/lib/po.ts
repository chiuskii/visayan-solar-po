import "server-only";
import { execute, query, queryOne } from "@/db";
import { cols, type CompanySettings, type PoStatus } from "@/db/types";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(
  items: { quantity: number; unitCost: number }[],
  discount: number,
  vatRate: number,
) {
  const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
  const net = round2(Math.max(0, subtotal - discount));
  const vat = round2((net * vatRate) / 100);
  return { subtotal, discount: round2(discount), net, vat, total: round2(net + vat) };
}

/**
 * Lines grouped by supplier (in order of first appearance), each with its own totals.
 * The PO discount is shared across suppliers in proportion to their subtotals, so the
 * groups add up to the PO total.
 */
export function totalsBySupplier<T extends { supplierId: number; quantity: number; unitCost: number }>(
  items: T[],
  discount: number,
  vatRate: number,
) {
  const groups = new Map<number, T[]>();
  for (const i of items) groups.set(i.supplierId, [...(groups.get(i.supplierId) ?? []), i]);
  const subtotal = computeTotals(items, 0, 0).subtotal;
  let discountLeft = round2(Math.min(discount, subtotal));
  const entries = [...groups.entries()];
  return entries.map(([supplierId, lines], n) => {
    const sub = computeTotals(lines, 0, 0).subtotal;
    const share = n === entries.length - 1 ? discountLeft : round2(subtotal ? (discount * sub) / subtotal : 0);
    const d = Math.min(share, discountLeft, sub);
    discountLeft = round2(discountLeft - d);
    return { supplierId, items: lines, totals: computeTotals(lines, d, vatRate) };
  });
}

export async function getSettings(): Promise<CompanySettings> {
  const row = await queryOne<CompanySettings>(`SELECT ${cols("company_settings")} FROM company_settings WHERE id = 1`);
  return (
    row ?? {
      id: 1,
      companyName: "Visayan Solar",
      address: null,
      phone: null,
      email: null,
      tin: null,
      poPrefix: "VS-PO",
      defaultTerms: null,
      poFooter: null,
      approverName: null,
      approverTitle: null,
      updatedAt: "",
    }
  );
}

/** Next PO number, e.g. VS-PO-2026-0007 (sequence restarts each year). */
export async function nextPoNumber(poDate: string) {
  const { poPrefix } = await getSettings();
  const year = poDate.slice(0, 4);
  const base = `${poPrefix}-${year}-`;
  const row = await queryOne<{ maxNo: string | null }>(
    "SELECT MAX(po_number) AS maxNo FROM purchase_orders WHERE po_number LIKE ?",
    [`${base}%`],
  );
  const last = row?.maxNo ? parseInt(row.maxNo.slice(base.length), 10) || 0 : 0;
  return `${base}${String(last + 1).padStart(4, "0")}`;
}

/** Received quantity per PO item. */
export async function receivedByItem(itemIds: number[]) {
  const map = new Map<number, number>();
  if (itemIds.length === 0) return map;
  const rows = await query<{ poItemId: number; qty: number }>(
    "SELECT po_item_id AS poItemId, SUM(quantity) AS qty FROM delivery_items WHERE po_item_id IN (?) GROUP BY po_item_id",
    [itemIds],
  );
  for (const r of rows) map.set(r.poItemId, Number(r.qty));
  return map;
}

/** Sets ORDERED / PARTIAL / DELIVERED from what has been received. Leaves DRAFT and CANCELLED alone. */
export async function refreshDeliveryStatus(poId: number) {
  const po = await queryOne<{ status: PoStatus }>("SELECT status FROM purchase_orders WHERE id = ?", [poId]);
  if (!po || po.status === "CANCELLED" || po.status === "DRAFT") return;
  const items = await query<{ id: number; quantity: number }>("SELECT id, quantity FROM po_items WHERE po_id = ?", [poId]);
  const received = await receivedByItem(items.map((i) => i.id));
  const anyReceived = items.some((i) => (received.get(i.id) ?? 0) > 0);
  const allReceived = items.length > 0 && items.every((i) => (received.get(i.id) ?? 0) >= i.quantity);
  const status = allReceived ? "DELIVERED" : anyReceived ? "PARTIAL" : "ORDERED";
  if (status !== po.status) await execute("UPDATE purchase_orders SET status = ? WHERE id = ?", [status, poId]);
}

export async function poHasDeliveries(poId: number) {
  const row = await queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM deliveries WHERE po_id = ?", [poId]);
  return Number(row?.n ?? 0) > 0;
}
