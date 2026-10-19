import Link from "next/link";
import { Fragment } from "react";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso } from "@/lib/format";
import { projectCost } from "@/lib/project-cost";

export const metadata = { title: "Project cost" };

type SP = { client?: string; from?: string; to?: string };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ProjectCostPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const clientId = Number(sp.client) || null;
  const from = isDate(sp.from) ? sp.from! : "";
  const to = isDate(sp.to) ? sp.to! : "";
  const [clients, report] = await Promise.all([
    query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    clientId ? projectCost(clientId, { from: from || undefined, to: to || undefined }) : null,
  ]);
  const qs = new URLSearchParams();
  if (clientId) qs.set("client", String(clientId));
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  return (
    <>
      <PageHeader
        title="Project cost"
        subtitle="Materials cost per project: warehouse materials assigned (less returns) plus direct-to-site POs. Amounts are before VAT."
        back={{ href: "/inventory", label: "Inventory" }}
        actions={report && <a href={`/inventory/project-cost/export?${qs}`} className="btn btn-primary">Export CSV</a>}
      />
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="client">Project / client</label>
          <select id="client" name="client" className="input w-auto" defaultValue={clientId ?? ""} required>
            <option value="">Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" className="input" defaultValue={from} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" className="input" defaultValue={to} />
        </div>
        <button className="btn">Show</button>
      </form>

      {!clientId ? (
        <Empty>Choose a project / client to see its materials cost.</Empty>
      ) : !report ? (
        <Empty>That client no longer exists.</Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs text-slate-500">Warehouse materials</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{peso(report.totals.warehouse)}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">Direct-to-site POs (before VAT)</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{peso(report.totals.directNet)}</div>
              {report.totals.directVat > 0 && <div className="text-xs text-slate-500">+ VAT {peso(report.totals.directVat)}</div>}
            </div>
            <div className="card border-brand-300 p-4">
              <div className="text-xs text-slate-500">Materials cost</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{peso(report.totals.materials)}</div>
            </div>
          </div>

          <section className="card mb-6 overflow-x-auto">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2>Warehouse materials</h2>
              <p className="text-sm text-slate-500">Assigned through job orders, less returns, at the cost they went out at.</p>
            </div>
            {report.warehouse.length === 0 ? (
              <Empty>No warehouse materials assigned{from || to ? " in this period" : ""}.</Empty>
            ) : (
              <table className="table min-w-[720px]">
                <thead><tr><th>Material</th><th className="num">Issued</th><th className="num">Returned</th><th className="num">Net</th><th className="num">Cost</th></tr></thead>
                <tbody>
                  {report.warehouse.map((r) => (
                    <tr key={r.materialId}>
                      <td>
                        <Link className="text-brand-700 hover:underline" href={`/inventory/${r.materialId}`}>{r.name}</Link>
                        {r.spec && <span className="text-slate-500"> · {r.spec}</span>}
                      </td>
                      <td className="num">{num(r.issued)} {r.unit}</td>
                      <td className="num">{r.returned ? `${num(r.returned)} ${r.unit}` : "—"}</td>
                      <td className="num font-medium">{num(r.net)} {r.unit}</td>
                      <td className="num">
                        {peso(r.cost)}
                        {r.estimated && <span className="ml-1 text-xs text-amber-700" title="No cost was recorded on some movements; the material’s default cost was used.">est.</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><td colSpan={4}>Total</td><td className="num">{peso(report.totals.warehouse)}</td></tr>
                </tbody>
              </table>
            )}
          </section>

          <section className="card overflow-x-auto">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2>Direct-to-site POs</h2>
              <p className="text-sm text-slate-500">Ordered, partly delivered or delivered POs for this project. Lines not fully received are flagged.</p>
            </div>
            {report.direct.length === 0 ? (
              <Empty>No direct-to-site POs for this project{from || to ? " in this period" : ""}.</Empty>
            ) : (
              <table className="table min-w-[860px]">
                <thead><tr><th>PO</th><th>Supplier</th><th>Description</th><th className="num">Qty</th><th className="num">Received</th><th className="num">Unit cost</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {report.direct.map((po) => (
                    <Fragment key={po.poId}>
                      {po.lines.map((l, i) => (
                        <tr key={`${po.poId}-${i}`} className={i === 0 ? "border-t-2 border-slate-200" : ""}>
                          <td className="whitespace-nowrap">
                            {i === 0 && (
                              <>
                                <Link className="font-medium text-brand-700 hover:underline" href={`/pos/${po.poId}`}>{po.poNumber}</Link>
                                <div className="text-xs text-slate-500">{fmtDate(po.poDate)} <StatusBadge status={po.status} /></div>
                              </>
                            )}
                          </td>
                          <td>{l.supplier}</td>
                          <td>{l.description}{l.spec && <span className="text-slate-500"> · {l.spec}</span>}</td>
                          <td className="num">{num(l.quantity)} {l.unit}</td>
                          <td className={`num ${l.received < l.quantity ? "font-medium text-amber-700" : ""}`}>
                            {num(l.received)}{l.received < l.quantity && <span className="ml-1 text-xs">not all received</span>}
                          </td>
                          <td className="num">{peso(l.unitCost)}</td>
                          <td className="num">{peso(l.amount)}</td>
                        </tr>
                      ))}
                      {po.discount > 0 && (
                        <tr key={`${po.poId}-d`}><td></td><td colSpan={5} className="text-slate-600">Discount on {po.poNumber}</td><td className="num">−{peso(po.discount)}</td></tr>
                      )}
                    </Fragment>
                  ))}
                  <tr className="font-semibold"><td colSpan={6}>Total before VAT</td><td className="num">{peso(report.totals.directNet)}</td></tr>
                  {report.totals.directVat > 0 && <tr className="text-slate-600"><td colSpan={6}>VAT (not in materials cost)</td><td className="num">{peso(report.totals.directVat)}</td></tr>}
                </tbody>
              </table>
            )}
            {report.excluded.length > 0 && (
              <p className="border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
                Not counted: {report.excluded.map((e) => `${e.n} ${e.status.toLowerCase()}`).join(", ")} direct PO{report.excluded.reduce((s, e) => s + e.n, 0) === 1 ? "" : "s"} for this project.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
