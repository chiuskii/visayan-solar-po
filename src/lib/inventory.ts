import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { execute, getPool, query } from "@/db";
import type { StockMovement } from "@/db/types";

/** Stock on hand per material (materials with no movements are left out). */
export async function onHandByMaterial(materialIds?: number[], conn?: PoolConnection) {
  const map = new Map<number, number>();
  if (materialIds && materialIds.length === 0) return map;
  const rows = await query<{ materialId: number; qty: number }>(
    `SELECT material_id AS materialId, SUM(quantity) AS qty FROM stock_movements
     ${materialIds ? "WHERE material_id IN (?)" : ""} GROUP BY material_id`,
    materialIds ? [materialIds] : [],
    conn ?? getPool(),
  );
  for (const r of rows) map.set(r.materialId, Number(r.qty));
  return map;
}

/** Thrown (inside a transaction, to roll it back) when a change would leave stock below zero. */
export class NegativeStockError extends Error {}

/** Throws NegativeStockError if any of these materials now has less than zero on hand. */
export async function assertNoNegativeStock(materialIds: number[], conn: PoolConnection) {
  if (materialIds.length === 0) return;
  const neg = await query<{ name: string; unit: string; qty: number }>(
    `SELECT m.name, m.unit, SUM(sm.quantity) AS qty FROM stock_movements sm JOIN materials m ON m.id = sm.material_id
     WHERE sm.material_id IN (?) GROUP BY m.id HAVING SUM(sm.quantity) < 0 LIMIT 1`,
    [materialIds],
    conn,
  );
  if (neg[0]) {
    throw new NegativeStockError(
      `That would leave “${neg[0].name}” at ${neg[0].qty} ${neg[0].unit} — some of this stock has already been issued. Adjust or remove those issues first.`,
    );
  }
}

/**
 * Rebuilds the stock receipts for a PO's deliveries: removes them, then — if the PO is
 * delivered to the warehouse — adds one RECEIVE movement per delivered line that is linked
 * to a material. Call after recording deliveries or editing the PO.
 */
export async function syncPoStock(poId: number, conn?: PoolConnection) {
  const c = conn ?? getPool();
  await execute(
    `DELETE sm FROM stock_movements sm
     JOIN deliveries d ON d.id = sm.delivery_id
     WHERE d.po_id = ? AND sm.type = 'RECEIVE'`,
    [poId],
    c,
  );
  await execute(
    `INSERT INTO stock_movements (material_id, type, quantity, movement_date, delivery_id, po_item_id, reference, created_by_id)
     SELECT pi.material_id, 'RECEIVE', di.quantity, d.delivery_date, d.id, pi.id,
            LEFT(CONCAT(po.po_number, IF(d.dr_number IS NULL, '', CONCAT(' · DR ', d.dr_number))), 120), d.created_by_id
     FROM delivery_items di
     JOIN deliveries d ON d.id = di.delivery_id
     JOIN po_items pi ON pi.id = di.po_item_id
     JOIN purchase_orders po ON po.id = d.po_id
     WHERE d.po_id = ? AND po.to_warehouse = 1 AND pi.material_id IS NOT NULL`,
    [poId],
    c,
  );
}

export type StockRow = {
  id: number;
  name: string;
  spec: string | null;
  category: string | null;
  unit: string;
  defaultCost: number;
  reorderLevel: number;
  onHand: number;
  lastMovement: string | null;
};

export const stockStatus = (r: Pick<StockRow, "onHand" | "reorderLevel">) =>
  r.onHand <= 0 ? "out" : r.reorderLevel > 0 && r.onHand <= r.reorderLevel ? "low" : "ok";

/** Every material with its stock on hand. `filter`: "stock" = on hand > 0, "low" = at/below reorder level or out. */
export async function listStock(search = "", filter: "all" | "stock" | "low" = "all") {
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    where.push("(m.name LIKE ? OR m.spec LIKE ? OR m.category LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const having =
    filter === "stock" ? "HAVING onHand > 0" : filter === "low" ? "HAVING (m.reorder_level > 0 AND onHand <= m.reorder_level) OR (onHand < 0)" : "";
  return query<StockRow>(
    `SELECT m.id, m.name, m.spec, m.category, m.unit, m.default_cost AS defaultCost, m.reorder_level AS reorderLevel,
            COALESCE(SUM(sm.quantity), 0) AS onHand, MAX(sm.movement_date) AS lastMovement
     FROM materials m
     LEFT JOIN stock_movements sm ON sm.material_id = m.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY m.id
     ${having}
     ORDER BY m.name, m.spec
     LIMIT 1000`,
    params,
  );
}

export type MovementRow = StockMovement & {
  materialName: string;
  materialUnit: string;
  clientName: string | null;
  byName: string | null;
  poId: number | null;
};

const MOVEMENT_SELECT = `
  SELECT sm.id, sm.material_id AS materialId, sm.type, sm.quantity, sm.movement_date AS movementDate,
         sm.delivery_id AS deliveryId, sm.po_item_id AS poItemId, sm.client_id AS clientId, sm.reference, sm.notes,
         sm.created_by_id AS createdById, sm.created_at AS createdAt,
         m.name AS materialName, m.unit AS materialUnit, c.name AS clientName, u.name AS byName, d.po_id AS poId
  FROM stock_movements sm
  JOIN materials m ON m.id = sm.material_id
  LEFT JOIN clients c ON c.id = sm.client_id
  LEFT JOIN users u ON u.id = sm.created_by_id
  LEFT JOIN deliveries d ON d.id = sm.delivery_id`;

/** A material's movements, newest first, each with the balance after it. */
export async function materialLedger(materialId: number) {
  const rows = await query<MovementRow>(`${MOVEMENT_SELECT} WHERE sm.material_id = ? ORDER BY sm.movement_date, sm.id`, [materialId]);
  let balance = 0;
  const withBalance = rows.map((r) => {
    balance = Math.round((balance + r.quantity) * 100) / 100;
    return { ...r, balance };
  });
  return withBalance.reverse();
}

export async function recentMovements(limit = 15) {
  return query<MovementRow>(`${MOVEMENT_SELECT} ORDER BY sm.created_at DESC, sm.id DESC LIMIT ?`, [limit]);
}
