import Link from "next/link";
import { query } from "@/db";
import { fmtDate, num } from "@/lib/format";
import { Empty } from "./ui";

/** Materials assigned to a client from Inventory: totals per material, then each assignment. */
export async function ClientMaterials({ clientId }: { clientId: number }) {
  const rows = await query<{
    id: number;
    movementDate: string;
    materialId: number;
    name: string;
    spec: string | null;
    unit: string;
    qty: number;
    reference: string | null;
    byName: string | null;
  }>(
    `SELECT sm.id, sm.movement_date AS movementDate, m.id AS materialId, m.name, m.spec, m.unit, -sm.quantity AS qty,
            sm.reference, u.name AS byName
     FROM stock_movements sm
     JOIN materials m ON m.id = sm.material_id
     LEFT JOIN users u ON u.id = sm.created_by_id
     WHERE sm.client_id = ? AND sm.type = 'ISSUE'
     ORDER BY sm.movement_date DESC, sm.id DESC`,
    [clientId],
  );
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
        <Link href={`/inventory/issue?client=${clientId}`} className="btn btn-sm btn-primary">Assign materials</Link>
      </div>
      {rows.length === 0 ? (
        <Empty>Nothing assigned to this client yet.</Empty>
      ) : (
        <>
          <table className="table">
            <thead><tr><th>Material</th><th className="num">Total assigned</th></tr></thead>
            <tbody>
              {[...totals].map(([id, t]) => (
                <tr key={id}>
                  <td><Link className="text-brand-700 hover:underline" href={`/inventory/${id}`}>{t.name}</Link>{t.spec && <span className="text-slate-500"> · {t.spec}</span>}</td>
                  <td className="num font-medium">{num(t.qty)} {t.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">History</h3></div>
          <table className="table">
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.movementDate)}</td>
                  <td>{r.name}{r.spec && <span className="text-slate-500"> · {r.spec}</span>}</td>
                  <td className="num">{num(r.qty)} {r.unit}</td>
                  <td>{r.reference ?? "—"}</td>
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
