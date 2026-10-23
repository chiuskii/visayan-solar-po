import "server-only";
import type { PoolConnection } from "mysql2/promise";
import { query, queryOne } from "@/db";
import { cols, type Client, type JobOrder, type JobOrderItem, type JoStatus } from "@/db/types";

/**
 * SQL that joins `ji`, the job order line a stock movement `sm` belongs to: the name, spec, unit and price
 * as they were assigned to the client. Use IF(ji.id IS NULL, m.x, ji.x), so a blank on the job order stays blank.
 */
export const JO_LINE_JOIN = `
  LEFT JOIN (SELECT job_order_id, material_id, MIN(id) AS line_id FROM job_order_items GROUP BY job_order_id, material_id) jl
    ON jl.job_order_id = sm.job_order_id AND jl.material_id = sm.material_id
  LEFT JOIN job_order_items ji ON ji.id = jl.line_id`;

/**
 * Next job order number, e.g. VS-JO-2026-0007 (sequence restarts each year). Call inside the
 * transaction that inserts the job order: the row lock stops two assignments taking the same number.
 */
export async function nextJoNumber(joDate: string, conn: PoolConnection) {
  const prefix = (await queryOne<{ p: string }>("SELECT jo_prefix AS p FROM company_settings WHERE id = 1", [], conn))?.p || "VS-JO";
  const base = `${prefix}-${joDate.slice(0, 4)}-`;
  const row = await queryOne<{ maxNo: string | null }>(
    "SELECT MAX(jo_number) AS maxNo FROM job_orders WHERE jo_number LIKE ? FOR UPDATE",
    [`${base}%`],
    conn,
  );
  const last = row?.maxNo ? parseInt(row.maxNo.slice(base.length), 10) || 0 : 0;
  return `${base}${String(last + 1).padStart(4, "0")}`;
}

export async function getJobOrder(id: number) {
  const jo = await queryOne<JobOrder & { createdByName: string | null; createdByDesignation: string | null; cancelledByName: string | null }>(
    `SELECT ${cols("job_orders", "jo")}, u.name AS createdByName, u.designation AS createdByDesignation, x.name AS cancelledByName
     FROM job_orders jo
     LEFT JOIN users u ON u.id = jo.created_by_id
     LEFT JOIN users x ON x.id = jo.cancelled_by_id
     WHERE jo.id = ?`,
    [id],
  );
  if (!jo) return null;
  const [client, items] = await Promise.all([
    jo.clientId ? queryOne<Client>(`SELECT ${cols("clients")} FROM clients WHERE id = ?`, [jo.clientId]) : undefined,
    query<JobOrderItem>(`SELECT ${cols("job_order_items")} FROM job_order_items WHERE job_order_id = ? ORDER BY sort_order, id`, [id]),
  ]);
  return { ...jo, client: client ?? null, items, materials: await jobOrderMaterials(id) };
}

export type JoMaterial = {
  materialId: number;
  description: string;
  spec: string | null;
  unit: string;
  issued: number;
  returned: number;
  /** Still with the client: issued less returned. */
  out: number;
  /** The client's price per unit on this job order (used for its assignments and returns). */
  cost: number;
};

/**
 * Per material on a job order: issued (from its items, so it's right even if old ISSUE rows were
 * cleared from the log), returned (RETURN movements) and still out. Pass `conn` inside a transaction.
 */
export async function jobOrderMaterials(joId: number, conn?: PoolConnection): Promise<JoMaterial[]> {
  const rows = await query<{ materialId: number; description: string; spec: string | null; unit: string; issued: number; returned: number; cost: number }>(
    `SELECT i.material_id AS materialId, MIN(i.description) AS description, MIN(i.spec) AS spec, MIN(i.unit) AS unit,
            SUM(i.quantity) AS issued,
            COALESCE((SELECT SUM(r.quantity) FROM stock_movements r
                      WHERE r.job_order_id = ? AND r.material_id = i.material_id AND r.type = 'RETURN'), 0) AS returned,
            MIN(i.unit_cost) AS cost
     FROM job_order_items i
     WHERE i.job_order_id = ? AND i.material_id IS NOT NULL
     GROUP BY i.material_id
     ORDER BY MIN(i.sort_order), MIN(i.id)`,
    [joId, joId],
    conn,
  );
  return rows.map((r) => {
    const issued = Math.round(Number(r.issued) * 100) / 100;
    const returned = Math.round(Number(r.returned) * 100) / 100;
    return { ...r, issued, returned, out: Math.round((issued - returned) * 100) / 100, cost: Number(r.cost) };
  });
}

export type JobOrderDetail = NonNullable<Awaited<ReturnType<typeof getJobOrder>>>;

export type JobOrderRow = JobOrder & { clientName: string | null; createdByName: string | null; lines: number };

/** Job orders, newest first, with optional filters. */
export async function listJobOrders(f: { clientId?: number | null; status?: JoStatus | null; search?: string; from?: string; to?: string; limit: number; offset: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.clientId) {
    where.push("jo.client_id = ?");
    params.push(f.clientId);
  }
  if (f.status) {
    where.push("jo.status = ?");
    params.push(f.status);
  }
  if (f.from) {
    where.push("jo.jo_date >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("jo.jo_date <= ?");
    params.push(f.to);
  }
  if (f.search) {
    where.push("(jo.jo_number LIKE ? OR jo.reference LIKE ? OR c.name LIKE ?)");
    params.push(`%${f.search}%`, `%${f.search}%`, `%${f.search}%`);
  }
  const FROM = `FROM job_orders jo LEFT JOIN clients c ON c.id = jo.client_id LEFT JOIN users u ON u.id = jo.created_by_id
               ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const [rows, count] = await Promise.all([
    query<JobOrderRow>(
      `SELECT ${cols("job_orders", "jo")}, c.name AS clientName, u.name AS createdByName,
              (SELECT COUNT(*) FROM job_order_items i WHERE i.job_order_id = jo.id) AS \`lines\`
       ${FROM}
       ORDER BY jo.jo_date DESC, jo.id DESC LIMIT ? OFFSET ?`,
      [...params, f.limit, f.offset],
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n ${FROM}`, params),
  ]);
  return { rows, total: Number(count?.n ?? 0) };
}
