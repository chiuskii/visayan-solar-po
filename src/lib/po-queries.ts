import "server-only";
import { query, queryOne } from "@/db";
import { cols, type Client, type Delivery, type PoItem, type PurchaseOrder, type Supplier } from "@/db/types";
import { computeTotals, receivedByItem, round2, totalsBySupplier } from "./po";

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
  const client = await queryOne<Client>(`SELECT ${cols("clients")} FROM clients WHERE id = ?`, [po.clientId]);
  if (!client) return null;

  const items = await query<PoItem & { supplierName: string }>(
    `SELECT ${cols("po_items", "pi")}, s.name AS supplierName
     FROM po_items pi
     JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.po_id = ?
     ORDER BY pi.sort_order, pi.id`,
    [id],
  );
  const received = await receivedByItem(items.map((i) => i.id));
  const itemsWithBalance = items.map((i) => {
    const rec = received.get(i.id) ?? 0;
    return { ...i, amount: round2(i.quantity * i.unitCost), received: rec, balance: round2(Math.max(0, i.quantity - rec)) };
  });

  const supplierIds = [...new Set(items.map((i) => i.supplierId))];
  const supplierRows = supplierIds.length
    ? await query<Supplier>(`SELECT ${cols("suppliers")} FROM suppliers WHERE id IN (?)`, [supplierIds])
    : [];
  const bySupplier = totalsBySupplier(itemsWithBalance, poRow.discount, poRow.vatRate).map((g) => ({
    ...g,
    supplier: supplierRows.find((s) => s.id === g.supplierId)!,
  }));

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
    createdByName,
    items: itemsWithBalance,
    totals: computeTotals(items, poRow.discount, poRow.vatRate),
    /** One entry per supplier on this PO, with that supplier's lines and share of the totals. */
    bySupplier,
    deliveries: dels.map((d) => ({ ...d, items: dItems.filter((x) => x.deliveryId === d.id) })),
  };
}

export type PoDetail = NonNullable<Awaited<ReturnType<typeof getPoDetail>>>;
