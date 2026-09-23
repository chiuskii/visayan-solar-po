import "server-only";
import { query, queryOne } from "@/db";
import { cols, type Client, type Delivery, type PoItem, type PurchaseOrder, type Supplier } from "@/db/types";
import { computeTotals, receivedByItem, round2 } from "./po";

export async function getPoDetail(id: number) {
  const po = await queryOne<PurchaseOrder & { createdByName: string | null }>(
    `SELECT ${cols("purchase_orders", "po")}, u.name AS createdByName
     FROM purchase_orders po
     LEFT JOIN users u ON u.id = po.created_by_id
     WHERE po.id = ?`,
    [id],
  );
  if (!po) return null;
  const { createdByName, ...poRow } = po;
  const [client, supplier] = await Promise.all([
    queryOne<Client>(`SELECT ${cols("clients")} FROM clients WHERE id = ?`, [po.clientId]),
    queryOne<Supplier>(`SELECT ${cols("suppliers")} FROM suppliers WHERE id = ?`, [po.supplierId]),
  ]);
  if (!client || !supplier) return null;

  const items = await query<PoItem>(`SELECT ${cols("po_items")} FROM po_items WHERE po_id = ? ORDER BY sort_order, id`, [id]);
  const received = await receivedByItem(items.map((i) => i.id));
  const itemsWithBalance = items.map((i) => {
    const rec = received.get(i.id) ?? 0;
    return { ...i, amount: round2(i.quantity * i.unitCost), received: rec, balance: round2(Math.max(0, i.quantity - rec)) };
  });

  const dels = await query<Delivery & { byName: string | null }>(
    `SELECT ${cols("deliveries", "d")}, u.name AS byName
     FROM deliveries d
     LEFT JOIN users u ON u.id = d.created_by_id
     WHERE d.po_id = ?
     ORDER BY d.delivery_date DESC, d.id DESC`,
    [id],
  );
  const dItems = dels.length
    ? await query<{ deliveryId: number; quantity: number; description: string; spec: string | null; unit: string }>(
        `SELECT di.delivery_id AS deliveryId, di.quantity, pi.description, pi.spec, pi.unit
         FROM delivery_items di
         JOIN po_items pi ON pi.id = di.po_item_id
         WHERE di.delivery_id IN (?)`,
        [dels.map((d) => d.id)],
      )
    : [];

  return {
    po: poRow,
    client,
    supplier,
    createdByName,
    items: itemsWithBalance,
    totals: computeTotals(items, poRow.discount, poRow.vatRate),
    deliveries: dels.map((d) => ({ ...d, items: dItems.filter((x) => x.deliveryId === d.id) })),
  };
}

export type PoDetail = NonNullable<Awaited<ReturnType<typeof getPoDetail>>>;
