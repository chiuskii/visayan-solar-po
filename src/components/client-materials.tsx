import Link from "next/link";
import { query } from "@/db";
import { returnFromClient } from "@/app/actions/inventory";
import { fmtDate, num, todayPH } from "@/lib/format";
import { ClientReturnButton } from "./return-forms";
import { Empty } from "./ui";

/** Materials assigned to a client from Inventory: net totals per material (less returns), then each movement. */
export async function ClientMaterials({ clientId }: { clientId: number }) {
  const rows = await query<{
    id: number;
    movementDate: string;
    materialId: number;
    name: string;
    spec: string | null;
    unit: string;
    qty: number;
    type: string;
    reference: string | null;
    byName: string | null;
    jobOrderId: number | null;
    joNumber: string | null;
  }>(
    `SELECT sm.id, sm.movement_date AS movementDate, m.id AS materialId, m.name, m.spec, m.unit, -sm.quantity AS qty,
            sm.type, sm.reference, u.name AS byName, sm.job_order_id AS jobOrderId, jo.jo_number AS joNumber
     FROM stock_movements sm
     JOIN materials m ON m.id = sm.material_id
     LEFT JOIN users u ON u.id = sm.created_by_id
     LEFT JOIN job_orders jo ON jo.id = sm.job_order_id
     WHERE sm.client_id = ? AND sm.type IN ('ISSUE', 'RETURN')
     ORDER BY sm.movement_date DESC, sm.id DESC`,
    [clientId],
  );
  // What can be removed: still out on the client's open (not cancelled) job orders, per material.
  const outRows = await query<{ materialId: number; out: number }>(
    `SELECT i.material_id AS materialId,
            SUM(i.quantity) - COALESCE((SELECT SUM(r.quantity) FROM stock_movements r JOIN job_orders j ON j.id = r.job_order_id
                                        WHERE r.type = 'RETURN' AND r.material_id = i.material_id AND j.client_id = ? AND j.status = 'ISSUED'), 0) AS \`out\`
     FROM job_order_items i JOIN job_orders jo ON jo.id = i.job_order_id
     WHERE jo.client_id = ? AND jo.status = 'ISSUED' AND i.material_id IS NOT NULL
     GROUP BY i.material_id`,
    [clientId, clientId],
  );
  const outOnJos = new Map(outRows.map((r) => [r.materialId, Math.round(Number(r.out) * 100) / 100]));
  const today = todayPH();
  const totals = new Map<number, { name: string; spec: string | null; unit: string; qty: number }>();
  for (const r of rows) {
    const t = totals.get(r.materialId) ?? { name: r.name, spec: r.spec, unit: r.unit, qty: 0 };
    t.qty = Math.round((t.qty + r.qty) * 100) / 100;
    totals.set(r.materialId, t);
  }

  return (
    <section className="card mt-6 max-w-3xl overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2>Materials assigned</h2>
        <div className="flex gap-2">
          <Link href={`/inventory/project-cost?client=${clientId}`} className="btn btn-sm">Project cost</Link>
          <Link href={`/inventory/job-orders?client=${clientId}`} className="btn btn-sm">Job orders</Link>
          <Link href={`/inventory/issue?client=${clientId}`} className="btn btn-sm btn-primary">Assign materials</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty>Nothing assigned to this client yet.</Empty>
      ) : (
        <>
          <table className="table">
            <thead><tr><th>Material</th><th className="num">Net assigned</th><th></th></tr></thead>
            <tbody>
              {[...totals].filter(([, t]) => t.qty !== 0).map(([id, t]) => (
                <tr key={id}>
                  <td><Link className="text-brand-700 hover:underline" href={`/inventory/${id}`}>{t.name}</Link>{t.spec && <span className="text-slate-500"> · {t.spec}</span>}</td>
                  <td className="num font-medium">{num(t.qty)} {t.unit}</td>
                  <td className="text-right">
                    <ClientReturnButton action={returnFromClient.bind(null, clientId, id)} unit={t.unit} max={outOnJos.get(id) ?? 0} today={today} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">History</h3></div>
          <table className="table">
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th>Job order / reference</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.movementDate)}</td>
                  <td>{r.name}{r.spec && <span className="text-slate-500"> · {r.spec}</span>}</td>
                  <td className="num">
                    {r.type === "RETURN" && <span className="mr-1 text-xs text-violet-700">Returned</span>}
                    {num(r.qty)} {r.unit}
                  </td>
                  <td>
                    {r.jobOrderId ? (
                      <>
                        <Link href={`/inventory/job-orders/${r.jobOrderId}`} className="text-brand-700 hover:underline">{r.joNumber}</Link>
                        {r.reference && r.reference !== r.joNumber && <span className="text-slate-600"> · {r.reference}</span>}
                      </>
                    ) : (r.reference ?? "—")}
                  </td>
                  <td>{r.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
