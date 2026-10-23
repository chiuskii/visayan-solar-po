import "server-only";
import { query, queryOne } from "@/db";
import type { PoStatus } from "@/db/types";
import { JO_LINE_JOIN } from "./job-orders";
import { computeTotals, round2 } from "./po";

// Materials cost of a project (client), for the project P&L:
//   warehouse materials assigned to it, less returns, at the cost they went out at
// + direct-to-site POs raised for it (ordered or later; drafts, pending and cancelled are left out).
// Amounts are before VAT; direct-PO VAT is shown separately.

export type WarehouseLine = {
  materialId: number;
  name: string;
  spec: string | null;
  unit: string;
  issued: number;
  returned: number;
  net: number;
  cost: number;
  /** Some of it has no price (₱0): set the client's price on the job order. */
  unpriced: boolean;
};

export type DirectLine = {
  poId: number;
  poNumber: string;
  poDate: string;
  status: PoStatus;
  supplier: string;
  description: string;
  spec: string | null;
  unit: string;
  quantity: number;
  unitCost: number;
  amount: number;
  received: number;
};

export type DirectPo = {
  poId: number;
  poNumber: string;
  poDate: string;
  status: PoStatus;
  lines: DirectLine[];
  subtotal: number;
  discount: number;
  net: number;
  vat: number;
  total: number;
  /** Some lines haven't been fully received yet. */
  pending: boolean;
};

export type ProjectCost = Awaited<ReturnType<typeof projectCost>>;

const COUNTED_PO_STATUSES = ["ORDERED", "PARTIAL", "DELIVERED"] as const;

export async function projectCost(clientId: number, range: { from?: string; to?: string } = {}) {
  const client = await queryOne<{ id: number; name: string; address: string | null }>("SELECT id, name, address FROM clients WHERE id = ?", [clientId]);
  if (!client) return null;

  const mWhere = ["sm.client_id = ?", "sm.type IN ('ISSUE', 'RETURN')"];
  const mParams: unknown[] = [clientId];
  const pWhere = ["po.client_id = ?", "po.to_warehouse = 0", "po.status IN (?)"];
  const pParams: unknown[] = [clientId, COUNTED_PO_STATUSES];
  if (range.from) {
    mWhere.push("sm.movement_date >= ?");
    mParams.push(range.from);
    pWhere.push("po.po_date >= ?");
    pParams.push(range.from);
  }
  if (range.to) {
    mWhere.push("sm.movement_date <= ?");
    mParams.push(range.to);
    pWhere.push("po.po_date <= ?");
    pParams.push(range.to);
  }

  const [warehouseRows, poRows, lineRows] = await Promise.all([
    query<{ materialId: number; name: string; spec: string | null; unit: string; issued: number; returned: number; cost: number; unpriced: number }>(
      // At the client's prices (on each movement), with names as assigned; never the material's current cost.
      `SELECT m.id AS materialId,
              MIN(IF(ji.id IS NULL, m.name, ji.description)) AS name, MIN(IF(ji.id IS NULL, m.spec, ji.spec)) AS spec, MIN(IF(ji.id IS NULL, m.unit, ji.unit)) AS unit,
              SUM(CASE WHEN sm.type = 'ISSUE' THEN -sm.quantity ELSE 0 END) AS issued,
              SUM(CASE WHEN sm.type = 'RETURN' THEN sm.quantity ELSE 0 END) AS returned,
              SUM(-sm.quantity * COALESCE(sm.unit_cost, 0)) AS cost,
              MAX(COALESCE(sm.unit_cost, 0) = 0) AS unpriced
       FROM stock_movements sm JOIN materials m ON m.id = sm.material_id ${JO_LINE_JOIN}
       WHERE ${mWhere.join(" AND ")}
       GROUP BY m.id
       ORDER BY cost DESC, name`,
      mParams,
    ),
    query<{ poId: number; poNumber: string; poDate: string; status: PoStatus; discount: number; vatRate: number }>(
      `SELECT po.id AS poId, po.po_number AS poNumber, po.po_date AS poDate, po.status, po.discount, po.vat_rate AS vatRate
       FROM purchase_orders po WHERE ${pWhere.join(" AND ")} ORDER BY po.po_date, po.id`,
      pParams,
    ),
    query<DirectLine>(
      `SELECT po.id AS poId, po.po_number AS poNumber, po.po_date AS poDate, po.status, s.name AS supplier,
              pi.description, pi.spec, pi.unit, pi.quantity, pi.unit_cost AS unitCost,
              ROUND(pi.quantity * pi.unit_cost, 2) AS amount,
              COALESCE((SELECT SUM(di.quantity) FROM delivery_items di WHERE di.po_item_id = pi.id), 0) AS received
       FROM purchase_orders po
       JOIN po_items pi ON pi.po_id = po.id
       JOIN suppliers s ON s.id = pi.supplier_id
       WHERE ${pWhere.join(" AND ")}
       ORDER BY po.po_date, po.id, pi.sort_order, pi.id`,
      pParams,
    ),
  ]);

  const warehouse: WarehouseLine[] = warehouseRows
    .map((r) => ({
      materialId: r.materialId,
      name: r.name,
      spec: r.spec,
      unit: r.unit,
      issued: round2(Number(r.issued)),
      returned: round2(Number(r.returned)),
      net: round2(Number(r.issued) - Number(r.returned)),
      cost: round2(Number(r.cost)),
      unpriced: Boolean(Number(r.unpriced)),
    }))
    .filter((r) => r.net !== 0 || r.cost !== 0);

  const direct: DirectPo[] = poRows.map((po) => {
    const lines = lineRows.filter((l) => l.poId === po.poId).map((l) => ({ ...l, received: Number(l.received) }));
    const t = computeTotals(lines, po.discount, po.vatRate);
    return {
      poId: po.poId,
      poNumber: po.poNumber,
      poDate: po.poDate,
      status: po.status,
      lines,
      subtotal: t.subtotal,
      discount: t.discount,
      net: t.net,
      vat: t.vat,
      total: t.total,
      pending: lines.some((l) => l.received < l.quantity),
    };
  });

  // Direct POs left out because they aren't ordered yet (or were cancelled), so Apol knows they exist.
  const excluded = await query<{ status: PoStatus; n: number }>(
    `SELECT po.status, COUNT(*) AS n FROM purchase_orders po
     WHERE po.client_id = ? AND po.to_warehouse = 0 AND po.status NOT IN (?) GROUP BY po.status`,
    [clientId, COUNTED_PO_STATUSES],
  );

  const warehouseTotal = round2(warehouse.reduce((s, r) => s + r.cost, 0));
  const directNet = round2(direct.reduce((s, p) => s + p.net, 0));
  const directVat = round2(direct.reduce((s, p) => s + p.vat, 0));
  return {
    client,
    range,
    warehouse,
    direct,
    excluded: excluded.map((e) => ({ status: e.status, n: Number(e.n) })),
    totals: {
      warehouse: warehouseTotal,
      directNet,
      directVat,
      /** Warehouse materials + direct POs, before VAT. */
      materials: round2(warehouseTotal + directNet),
    },
  };
}
