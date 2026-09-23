import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, deliveries, deliveryItems, poItems, purchaseOrders, suppliers, users } from "@/db/schema";
import { computeTotals, receivedByItem, round2 } from "./po";

export async function getPoDetail(id: number) {
  const [row] = await db
    .select({ po: purchaseOrders, client: clients, supplier: suppliers, createdByName: users.name })
    .from(purchaseOrders)
    .innerJoin(clients, eq(clients.id, purchaseOrders.clientId))
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdById))
    .where(eq(purchaseOrders.id, id))
    .limit(1);
  if (!row) return null;

  const items = await db.select().from(poItems).where(eq(poItems.poId, id)).orderBy(asc(poItems.sortOrder), asc(poItems.id));
  const received = await receivedByItem(items.map((i) => i.id));
  const itemsWithBalance = items.map((i) => {
    const rec = received.get(i.id) ?? 0;
    return { ...i, amount: round2(i.quantity * i.unitCost), received: rec, balance: round2(Math.max(0, i.quantity - rec)) };
  });

  const dels = await db
    .select({ d: deliveries, byName: users.name })
    .from(deliveries)
    .leftJoin(users, eq(users.id, deliveries.createdById))
    .where(eq(deliveries.poId, id))
    .orderBy(desc(deliveries.deliveryDate), desc(deliveries.id));
  const dItems = dels.length
    ? await db
        .select({ deliveryId: deliveryItems.deliveryId, quantity: deliveryItems.quantity, description: poItems.description, spec: poItems.spec, unit: poItems.unit })
        .from(deliveryItems)
        .innerJoin(poItems, eq(poItems.id, deliveryItems.poItemId))
        .where(inArray(deliveryItems.deliveryId, dels.map((d) => d.d.id)))
    : [];

  return {
    ...row,
    items: itemsWithBalance,
    totals: computeTotals(items, row.po.discount, row.po.vatRate),
    deliveries: dels.map(({ d, byName }) => ({ ...d, byName, items: dItems.filter((x) => x.deliveryId === d.id) })),
  };
}

export type PoDetail = NonNullable<Awaited<ReturnType<typeof getPoDetail>>>;
