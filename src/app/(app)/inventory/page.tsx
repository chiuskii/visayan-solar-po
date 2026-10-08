import Link from "next/link";
import { clearMovementLog } from "@/app/actions/inventory";
import { ConfirmButton } from "@/components/client-ui";
import { MovementType, StockBadge } from "@/components/stock-ui";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso } from "@/lib/format";
import { listStock, recentMovements } from "@/lib/inventory";

export const metadata = { title: "Inventory" };

type SP = { q?: string; show?: string; saved?: string; mp?: string };
const PER_PAGE = 10;
const FILTERS = [
  { value: "all", label: "All materials" },
  { value: "stock", label: "In stock" },
  { value: "low", label: "Low / out" },
] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const show = FILTERS.find((f) => f.value === sp.show)?.value ?? "all";
  const page = Math.max(1, Math.floor(Number(sp.mp)) || 1);
  const [rows, recent] = await Promise.all([listStock(q, show), recentMovements(page, PER_PAGE)]);
  const pages = Math.max(1, Math.ceil(recent.total / PER_PAGE));
  // Links to another page of movements, keeping the stock filters.
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (show !== "all") p.set("show", show);
    if (n > 1) p.set("mp", String(n));
    const qs = p.toString();
    return `/inventory${qs ? `?${qs}` : ""}#movements`;
  };
  const value = rows.reduce((s, r) => s + Math.max(0, r.onHand) * r.defaultCost, 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand in the warehouse. Warehouse PO deliveries add stock; issuing to a project takes it out."
        actions={
          <>
            <Link href="/inventory/adjust" className="btn">Adjust stock</Link>
            <Link href="/inventory/issue" className="btn btn-primary">Issue to project</Link>
          </>
        }
      />
      {sp.saved === "issue" && <p className="ok-box mb-4">Materials issued.</p>}
      {sp.saved === "cleared" && <p className="ok-box mb-4">Movement log cleared. Each material’s stock was kept as an opening balance.</p>}
      <form className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Search material, spec or category" />
        <select className="input w-auto" name="show" defaultValue={show}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <button className="btn">Filter</button>
        {(q || show !== "all") && <Link href="/inventory" className="btn">Clear</Link>}
        <span className="ml-auto self-center text-sm text-slate-600">
          Stock value (at default cost): <b className="tabular-nums">{peso(value)}</b>
        </span>
      </form>

      <div className="card mb-6 overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>{show === "all" && !q ? "No materials yet." : "Nothing matches."}</Empty>
        ) : (
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Material</th><th>Category</th><th className="num">On hand</th><th className="num">Reorder at</th><th className="num">Value</th><th>Last movement</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td>
                    <Link className="font-medium text-brand-700 hover:underline" href={`/inventory/${r.id}`}>{r.name}</Link>
                    {r.spec && <span className="text-slate-500"> · {r.spec}</span>}
                  </td>
                  <td>{r.category ?? "—"}</td>
                  <td className={`num font-medium ${r.onHand < 0 ? "text-red-600" : ""}`}>{num(r.onHand)} <span className="font-normal text-slate-500">{r.unit}</span></td>
                  <td className="num text-slate-500">{r.reorderLevel > 0 ? num(r.reorderLevel) : "—"}</td>
                  <td className="num">{r.onHand > 0 ? peso(r.onHand * r.defaultCost) : "—"}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.lastMovement)}</td>
                  <td><StockBadge row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <section id="movements" className="card scroll-mt-6 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2>Recent movements</h2>
          {user.role === "ADMIN" && recent.total > 0 && (
            <ConfirmButton
              action={clearMovementLog}
              label="Clear log"
              confirmLabel="Yes, clear the log (stock is kept)"
              className="btn btn-sm btn-danger"
            />
          )}
        </div>
        {recent.rows.length === 0 ? (
          <Empty>No stock movements yet.</Empty>
        ) : (
          <table className="table min-w-[760px]">
            <thead><tr><th>Date</th><th>Type</th><th>Material</th><th className="num">Qty</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>
              {recent.rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{fmtDate(m.movementDate)}</td>
                  <td><MovementType type={m.type} /></td>
                  <td><Link className="text-brand-700 hover:underline" href={`/inventory/${m.materialId}`}>{m.materialName}</Link></td>
                  <td className={`num ${m.quantity < 0 ? "text-red-700" : "text-emerald-700"}`}>{m.quantity > 0 ? "+" : ""}{num(m.quantity)} {m.materialUnit}</td>
                  <td className="max-w-xs truncate">
                    {m.poId ? <Link className="text-brand-700 hover:underline" href={`/pos/${m.poId}`}>{m.reference}</Link> : [m.clientName, m.reference].filter(Boolean).join(" · ") || m.notes || "—"}
                  </td>
                  <td>{m.byName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {recent.total > PER_PAGE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm">
            <span className="text-slate-500">
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, recent.total)} of {recent.total}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-sm">← Newer</Link> : <span className="btn btn-sm opacity-40">← Newer</span>}
              <span className="text-slate-500">Page {Math.min(page, pages)} of {pages}</span>
              {page < pages ? <Link href={pageHref(page + 1)} className="btn btn-sm">Older →</Link> : <span className="btn btn-sm opacity-40">Older →</span>}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
