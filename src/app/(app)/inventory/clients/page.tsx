import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/format";

export const metadata = { title: "Materials by client" };

type SP = { client?: string; from?: string; to?: string; q?: string; p?: string };
const PER_PAGE = 25;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ClientHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const clientId = Number(sp.client) || null;
  const from = isDate(sp.from) ? sp.from! : "";
  const to = isDate(sp.to) ? sp.to! : "";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);

  // Assignments (ISSUE movements) that went to a client, with the filters applied.
  const where = ["sm.type = 'ISSUE'", "sm.client_id IS NOT NULL"];
  const params: unknown[] = [];
  if (clientId) {
    where.push("sm.client_id = ?");
    params.push(clientId);
  }
  if (from) {
    where.push("sm.movement_date >= ?");
    params.push(from);
  }
  if (to) {
    where.push("sm.movement_date <= ?");
    params.push(to);
  }
  if (q) {
    where.push("(m.name LIKE ? OR m.spec LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  const FROM = `FROM stock_movements sm JOIN materials m ON m.id = sm.material_id JOIN clients c ON c.id = sm.client_id
                LEFT JOIN users u ON u.id = sm.created_by_id WHERE ${where.join(" AND ")}`;

  const [clients, totals, count, rows] = await Promise.all([
    query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    query<{ clientId: number; clientName: string; materialId: number; name: string; spec: string | null; unit: string; qty: number; times: number; last: string }>(
      `SELECT c.id AS clientId, c.name AS clientName, m.id AS materialId, m.name, m.spec, m.unit,
              -SUM(sm.quantity) AS qty, COUNT(*) AS times, MAX(sm.movement_date) AS last
       ${FROM} GROUP BY c.id, m.id ORDER BY c.name, m.name`,
      params,
    ),
    query<{ n: number }>(`SELECT COUNT(*) AS n ${FROM}`, params),
    query<{ id: number; date: string; clientId: number; clientName: string; materialId: number; name: string; spec: string | null; unit: string; qty: number; reference: string | null; byName: string | null }>(
      `SELECT sm.id, sm.movement_date AS date, c.id AS clientId, c.name AS clientName, m.id AS materialId, m.name, m.spec, m.unit,
              -sm.quantity AS qty, sm.reference, u.name AS byName
       ${FROM} ORDER BY sm.movement_date DESC, sm.id DESC LIMIT ? OFFSET ?`,
      [...params, PER_PAGE, (page - 1) * PER_PAGE],
    ),
  ]);
  const total = Number(count[0]?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (clientId) u.set("client", String(clientId));
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (q) u.set("q", q);
    if (p > 1) u.set("p", String(p));
    return `/inventory/clients${u.size ? `?${u}` : ""}`;
  };
  const filtered = Boolean(clientId || from || to || q);

  return (
    <>
      <PageHeader
        title="Materials by client"
        subtitle="History of materials assigned to each client from Inventory."
        back={{ href: "/inventory", label: "Inventory" }}
        actions={<Link href={`/inventory/issue${clientId ? `?client=${clientId}` : ""}`} className="btn btn-primary">Assign to client</Link>}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="client">Client</label>
          <select id="client" name="client" className="input w-auto" defaultValue={clientId ?? ""}>
            <option value="">All clients</option>
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
        <div>
          <label className="label" htmlFor="q">Material</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="Name or spec" />
        </div>
        <button className="btn">Filter</button>
        {filtered && <Link href="/inventory/clients" className="btn">Clear</Link>}
      </form>

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3"><h2>Totals by client</h2></div>
        {totals.length === 0 ? (
          <Empty>{filtered ? "Nothing matches these filters." : "No materials have been assigned to clients yet."}</Empty>
        ) : (
          <table className="table min-w-[640px]">
            <thead><tr><th>Client</th><th>Material</th><th className="num">Total assigned</th><th className="num">Times</th><th>Last</th></tr></thead>
            <tbody>
              {totals.map((t, i) => (
                <tr key={`${t.clientId}-${t.materialId}`} className={i > 0 && totals[i - 1].clientId !== t.clientId ? "border-t-2 border-slate-200" : ""}>
                  <td>
                    {(i === 0 || totals[i - 1].clientId !== t.clientId) && (
                      <Link href={`/clients/${t.clientId}`} className="font-medium text-brand-700 hover:underline">{t.clientName}</Link>
                    )}
                  </td>
                  <td>{t.name}{t.spec && <span className="text-slate-500"> · {t.spec}</span>}</td>
                  <td className="num font-medium">{num(t.qty)} {t.unit}</td>
                  <td className="num">{num(t.times)}</td>
                  <td className="whitespace-nowrap">{fmtDate(t.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3"><h2>History</h2></div>
        {rows.length === 0 ? (
          <Empty>No assignments to show.</Empty>
        ) : (
          <table className="table min-w-[760px]">
            <thead><tr><th>Date</th><th>Client</th><th>Material</th><th className="num">Qty</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td><Link href={`/clients/${r.clientId}`} className="text-brand-700 hover:underline">{r.clientName}</Link></td>
                  <td><Link href={`/inventory/${r.materialId}`} className="text-brand-700 hover:underline">{r.name}</Link>{r.spec && <span className="text-slate-500"> · {r.spec}</span>}</td>
                  <td className="num">{num(r.qty)} {r.unit}</td>
                  <td>{r.reference ?? "—"}</td>
                  <td>{r.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > PER_PAGE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm">
            <span className="text-slate-500">Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}</span>
            <div className="flex items-center gap-2">
              {page > 1 ? <Link href={href(page - 1)} className="btn btn-sm">← Newer</Link> : <span className="btn btn-sm opacity-40">← Newer</span>}
              <span className="text-slate-500">Page {Math.min(page, pages)} of {pages}</span>
              {page < pages ? <Link href={href(page + 1)} className="btn btn-sm">Older →</Link> : <span className="btn btn-sm opacity-40">Older →</span>}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
