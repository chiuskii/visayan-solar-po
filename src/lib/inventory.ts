import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { execute, getPool, query, queryOne, transaction } from "@/db";
import { toRow, type StockMovement } from "@/db/types";

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
 * to a material, at the PO line's unit price. Call after recording deliveries or editing the PO.
 * Deliveries up to company_settings.stock_cleared_delivery_id are skipped: they're from before
 * stock came in through PO receiving (see scripts/one-time/po-receiving-cutover.sql), and the
 * stock count after the cutover already includes them.
 */
export async function syncPoStock(poId: number, conn?: PoolConnection) {
  const c = conn ?? getPool();
  await execute(
    `DELETE sm FROM stock_movements sm
     JOIN deliveries d ON d.id = sm.delivery_id
     WHERE d.po_id = ? AND sm.type = 'RECEIVE'
       AND d.id > (SELECT stock_cleared_delivery_id FROM company_settings WHERE id = 1)`,
    [poId],
    c,
  );
  await execute(
    `INSERT INTO stock_movements (material_id, type, quantity, unit_cost, movement_date, delivery_id, po_item_id, reference, created_by_id)
     SELECT pi.material_id, 'RECEIVE', di.quantity, pi.unit_cost, d.delivery_date, d.id, pi.id,
            LEFT(CONCAT(po.po_number, IF(d.dr_number IS NULL, '', CONCAT(' · DR ', d.dr_number))), 120), d.created_by_id
     FROM delivery_items di
     JOIN deliveries d ON d.id = di.delivery_id
     JOIN po_items pi ON pi.id = di.po_item_id
     JOIN purchase_orders po ON po.id = d.po_id
     WHERE d.po_id = ? AND po.to_warehouse = 1 AND pi.material_id IS NOT NULL
       AND d.id > (SELECT stock_cleared_delivery_id FROM company_settings WHERE id = 1)`,
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
  joNumber: string | null;
};

const MOVEMENT_SELECT = `
  SELECT sm.id, sm.material_id AS materialId, sm.type, sm.quantity, sm.unit_cost AS unitCost, sm.movement_date AS movementDate,
         sm.delivery_id AS deliveryId, sm.po_item_id AS poItemId, sm.client_id AS clientId, sm.job_order_id AS jobOrderId, sm.reversal_of_id AS reversalOfId, sm.reference, sm.notes,
         sm.created_by_id AS createdById, sm.created_at AS createdAt,
         m.name AS materialName, m.unit AS materialUnit, c.name AS clientName, u.name AS byName, d.po_id AS poId, jo.jo_number AS joNumber
  FROM stock_movements sm
  JOIN materials m ON m.id = sm.material_id
  LEFT JOIN clients c ON c.id = sm.client_id
  LEFT JOIN users u ON u.id = sm.created_by_id
  LEFT JOIN deliveries d ON d.id = sm.delivery_id
  LEFT JOIN job_orders jo ON jo.id = sm.job_order_id`;

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

/** One page of all movements, newest first, plus the total count. */
export async function recentMovements(page: number, perPage = 10) {
  const [rows, total] = await Promise.all([
    query<MovementRow>(`${MOVEMENT_SELECT} ORDER BY sm.created_at DESC, sm.id DESC LIMIT ? OFFSET ?`, [perPage, (page - 1) * perPage]),
    query<{ n: number }>("SELECT COUNT(*) AS n FROM stock_movements"),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0) };
}

/**
 * Records a stock adjustment: `mode` "change" changes on hand by `quantity` (negative removes),
 * "set" records a count and adjusts on hand to match. Returns an error message, or null when saved.
 */
export async function recordAdjustment(a: {
  materialId: number;
  mode: "set" | "change";
  quantity: number;
  movementDate: string;
  notes: string | null;
  createdById: number | null;
}) {
  const quantity = Math.round(a.quantity * 100) / 100;
  if (a.mode === "set" && quantity < 0) return "A counted quantity can’t be negative.";
  return transaction(async (conn) => {
    const mat = await queryOne("SELECT id FROM materials WHERE id = ? FOR UPDATE", [a.materialId], conn);
    if (!mat) return "That material no longer exists.";
    const have = (await onHandByMaterial([a.materialId], conn)).get(a.materialId) ?? 0;
    const diff = Math.round((a.mode === "set" ? quantity - have : quantity) * 100) / 100;
    if (diff === 0) return a.mode === "set" ? `On hand is already ${have}. Nothing to change.` : "Enter an amount to add or remove.";
    const after = Math.round((have + diff) * 100) / 100;
    if (after < 0) return `That would leave ${after} on hand. Only ${have} is in stock.`;
    await execute(
      "INSERT INTO stock_movements SET ?",
      [
        toRow("stock_movements", {
          materialId: a.materialId,
          type: "ADJUST",
          quantity: diff,
          movementDate: a.movementDate,
          reference: a.mode === "set" ? `Count: ${quantity}` : null,
          notes: a.notes,
          createdById: a.createdById,
        }),
      ],
      conn,
    );
    return null;
  });
}

/**
 * Records a stock count for several materials at once: each counted material gets an ADJUST that
 * brings on hand to the counted quantity (none when it already matches). One transaction, with the
 * materials locked, so nothing moves while the count is saved.
 */
export async function recordCount(c: {
  lines: { materialId: number; counted: number }[];
  movementDate: string;
  notes: string;
  createdById: number;
}) {
  const ids = [...new Set(c.lines.map((l) => l.materialId))];
  if (ids.length !== c.lines.length) return { error: "A material is listed twice." } as const;
  return transaction(async (conn) => {
    const mats = await query<{ id: number }>("SELECT id FROM materials WHERE id IN (?) FOR UPDATE", [ids], conn);
    if (mats.length !== ids.length) return { error: "One of the materials no longer exists. Reload the page." } as const;
    const onHand = await onHandByMaterial(ids, conn);
    const rows = c.lines
      .map((l) => ({ ...l, diff: Math.round((l.counted - (onHand.get(l.materialId) ?? 0)) * 100) / 100 }))
      .filter((l) => l.diff !== 0);
    if (rows.length) {
      await execute(
        "INSERT INTO stock_movements (material_id, type, quantity, movement_date, reference, notes, created_by_id) VALUES ?",
        [rows.map((l) => [l.materialId, "ADJUST", l.diff, c.movementDate, `Count: ${l.counted}`, c.notes, c.createdById])],
        conn,
      );
    }
    return { counted: c.lines.length, adjusted: rows.length } as const;
  });
}
