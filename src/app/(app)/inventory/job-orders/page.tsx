import Link from "next/link";
import { JoStatusBadge } from "@/components/stock-ui";
import { Empty, PageHeader } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/format";
import { listJobOrders } from "@/lib/job-orders";

export const metadata = { title: "Job orders" };

type SP = { client?: string; status?: string; q?: string; from?: string; to?: string; p?: string };
const PER_PAGE = 25;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function JobOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const clientId = Number(sp.client) || null;
  const status = sp.status === "ISSUED" || sp.status === "CANCELLED" ? sp.status : null;
  const q = (sp.q ?? "").trim();
  const from = isDate(sp.from) ? sp.from! : "";
  const to = isDate(sp.to) ? sp.to! : "";
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const [clients, { rows, total }] = await Promise.all([
    query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    listJobOrders({ clientId, status, search: q, from, to, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (n: number) => {
    const u = new URLSearchParams();
    if (clientId) u.set("client", String(clientId));
    if (status) u.set("status", status);
    if (q) u.set("q", q);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (n > 1) u.set("p", String(n));
    return `/inventory/job-orders${u.size ? `?${u}` : ""}`;
  };
  const filtered = Boolean(clientId || status || q || from || to);

  return (
    <>
      <PageHeader
        title="Job orders"
        subtitle="One per client: created the first time materials are assigned to them, and added to after that."
        back={{ href: "/inventory", label: "Inventory" }}
        actions={<Link href={`/inventory/issue${clientId ? `?client=${clientId}` : ""}`} className="btn btn-primary">Assign to client</Link>}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="JO no., client or reference" />
        </div>
        <div>
          <label className="label" htmlFor="client">Client</label>
          <select id="client" name="client" className="input w-auto" defaultValue={clientId ?? ""}>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input w-auto" defaultValue={status ?? ""}>
            <option value="">All</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
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
        <button className="btn">Filter</button>
        {filtered && <Link href="/inventory/job-orders" className="btn">Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>{filtered ? "No job orders match these filters." : "No job orders yet. One is created the first time you assign materials to a client."}</Empty>
        ) : (
          <table className="table min-w-[760px]">
            <thead><tr><th>JO no.</th><th>Date</th><th>Client / project</th><th className="num">Items</th><th>Prepared by</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td><Link className="font-medium text-brand-700 hover:underline" href={`/inventory/job-orders/${j.id}`}>{j.joNumber}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(j.joDate)}</td>
                  <td>{[j.clientName, j.reference].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="num">{num(j.lines)}</td>
                  <td>{j.createdByName ?? "—"}</td>
                  <td><JoStatusBadge status={j.status} /></td>
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
      </div>
    </>
  );
}
