import { query, queryOne } from "@/db";
import { cols, PO_STATUSES, type PurchaseOrder } from "@/db/types";
import { ApiError, apiRoute, paging } from "@/lib/api-keys";
import { computeTotals } from "@/lib/po";

export const dynamic = "force-dynamic";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** POs, newest first. Filters: ?status=ORDERED,PARTIAL &from=YYYY-MM-DD &to=YYYY-MM-DD &search=<PO number>. */
export const GET = apiRoute("purchase_orders", "READ", async (req) => {
  const url = new URL(req.url);
  const { limit, offset } = paging(url);
  const where: string[] = [];
  const params: unknown[] = [];
  const status = (url.searchParams.get("status") ?? "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (status.length) {
    const bad = status.filter((s) => !(PO_STATUSES as readonly string[]).includes(s));
    if (bad.length) throw new ApiError(400, `Unknown status ${bad.join(", ")}. Use ${PO_STATUSES.join(", ")}.`);
    where.push("po.status IN (?)");
    params.push(status);
  }
  for (const [k, op] of [["from", ">="], ["to", "<="]] as const) {
    const v = url.searchParams.get(k);
    if (!v) continue;
    if (!isDate(v)) throw new ApiError(400, `'${k}' must be a date like 2026-01-31.`);
    where.push(`po.po_date ${op} ?`);
    params.push(v);
  }
  const search = url.searchParams.get("search")?.trim();
  if (search) {
    where.push("po.po_number LIKE ?");
    params.push(`%${search}%`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows, count] = await Promise.all([
    query<PurchaseOrder & { subtotal: number; suppliers: string | null; createdByName: string | null; approvedByName: string | null }>(
      `SELECT ${cols("purchase_orders", "po")},
              (SELECT COALESCE(SUM(pi.quantity * pi.unit_cost), 0) FROM po_items pi WHERE pi.po_id = po.id) AS subtotal,
              (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') FROM po_items pi JOIN suppliers s ON s.id = pi.supplier_id WHERE pi.po_id = po.id) AS suppliers,
              u.name AS createdByName, a.name AS approvedByName
       FROM purchase_orders po
       LEFT JOIN users u ON u.id = po.created_by_id
       LEFT JOIN users a ON a.id = po.approved_by_id
       ${w}
       ORDER BY po.po_date DESC, po.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM purchase_orders po ${w}`, params),
  ]);
  const data = rows.map(({ subtotal, suppliers, ...po }) => ({
    ...po,
    suppliers: suppliers ? suppliers.split(", ") : [],
    totals: computeTotals([{ quantity: 1, unitCost: Number(subtotal) }], po.discount, po.vatRate),
  }));
  return { data, total: Number(count?.n ?? 0), limit, offset };
});
