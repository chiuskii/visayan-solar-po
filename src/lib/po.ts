import "server-only";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { companySettings, deliveries, deliveryItems, poItems, purchaseOrders } from "@/db/schema";

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

export async function getSettings() {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1)).limit(1);
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
      updatedAt: new Date(),
    }
  );
}

/** Next PO number, e.g. VS-PO-2026-0007 (sequence restarts each year). */
export async function nextPoNumber(poDate: string) {
  const { poPrefix } = await getSettings();
  const year = poDate.slice(0, 4);
  const base = `${poPrefix}-${year}-`;
  const [row] = await db
    .select({ maxNo: sql<string | null>`MAX(${purchaseOrders.poNumber})` })
    .from(purchaseOrders)
    .where(like(purchaseOrders.poNumber, `${base}%`));
  const last = row?.maxNo ? parseInt(row.maxNo.slice(base.length), 10) || 0 : 0;
  return `${base}${String(last + 1).padStart(4, "0")}`;
}

/** Received quantity per PO item. */
export async function receivedByItem(itemIds: number[]) {
  const map = new Map<number, number>();
  if (itemIds.length === 0) return map;
  const rows = await db
    .select({ poItemId: deliveryItems.poItemId, qty: sql<string>`SUM(${deliveryItems.quantity})` })
    .from(deliveryItems)
    .where(inArray(deliveryItems.poItemId, itemIds))
    .groupBy(deliveryItems.poItemId);
  for (const r of rows) map.set(r.poItemId, Number(r.qty));
  return map;
}

/** Sets ORDERED / PARTIAL / DELIVERED from what has been received. Leaves DRAFT and CANCELLED alone. */
export async function refreshDeliveryStatus(poId: number) {
  const [po] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders).where(eq(purchaseOrders.id, poId));
  if (!po || po.status === "CANCELLED" || po.status === "DRAFT") return;
  const items = await db.select({ id: poItems.id, quantity: poItems.quantity }).from(poItems).where(eq(poItems.poId, poId));
  const received = await receivedByItem(items.map((i) => i.id));
  const anyReceived = items.some((i) => (received.get(i.id) ?? 0) > 0);
  const allReceived = items.length > 0 && items.every((i) => (received.get(i.id) ?? 0) >= i.quantity);
  const status = allReceived ? "DELIVERED" : anyReceived ? "PARTIAL" : "ORDERED";
  if (status !== po.status) await db.update(purchaseOrders).set({ status }).where(eq(purchaseOrders.id, poId));
}

export async function poHasDeliveries(poId: number) {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(deliveries)
    .where(and(eq(deliveries.poId, poId)));
  return Number(row?.n ?? 0) > 0;
}
