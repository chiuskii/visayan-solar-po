import Link from "next/link";
import { notFound } from "next/navigation";
import { reverseMovement } from "@/app/actions/inventory";
import { MovementRef, MovementType, StockBadge } from "@/components/stock-ui";
import { Empty, PageHeader } from "@/components/ui";
import { queryOne } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso } from "@/lib/format";
import { materialLedger } from "@/lib/inventory";

export const metadata = { title: "Stock history" };

export default async function StockHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const { saved, error } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const m = await queryOne<{ name: string; spec: string | null; unit: string; defaultCost: number; reorderLevel: number }>(
    "SELECT name, spec, unit, default_cost AS defaultCost, reorder_level AS reorderLevel FROM materials WHERE id = ?",
    [id],
  );
  if (!m) notFound();
  const ledger = await materialLedger(id);
  // Movements that a later adjustment has reversed.
  const reversed = new Set(ledger.map((r) => r.reversalOfId).filter((x): x is number => x !== null));
  const onHand = ledger[0]?.balance ?? 0;
  const lastMovement = ledger[0]?.movementDate ?? null;

  return (
    <>
      <PageHeader
        title={m.name}
        subtitle={[m.spec, "stock history"].filter(Boolean).join(" · ")}
        back={{ href: "/inventory", label: "Inventory" }}
        actions={
          <>
            <Link href={`/materials/${id}`} className="btn">Edit material</Link>
            <Link href={`/inventory/adjust?material=${id}`} className="btn btn-primary">Adjust stock</Link>
          </>
        }
      />
      {saved === "adjust" && <p className="ok-box mb-4">Adjustment saved.</p>}
      {saved === "reversed" && <p className="ok-box mb-4">Adjustment reversed. Both entries stay in the history.</p>}
      {error === "not-reversible" && <p className="error-box mb-4">Only an adjustment that hasn’t been reversed can be reversed. Assignments are undone by cancelling the job order.</p>}
      {error === "reason" && <p className="error-box mb-4">Give a reason for the reversal.</p>}
      {error === "negative" && <p className="error-box mb-4">Reversing that would leave stock below zero, so it was not reversed.</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-slate-500">On hand</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${onHand < 0 ? "text-red-600" : ""}`}>{num(onHand)} <span className="text-base font-normal text-slate-500">{m.unit}</span></div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Status</div>
          <div className="mt-2"><StockBadge row={{ onHand, reorderLevel: m.reorderLevel, lastMovement }} /></div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Reorder at</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{m.reorderLevel > 0 ? num(m.reorderLevel) : "—"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Value (default cost)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{peso(Math.max(0, onHand) * m.defaultCost)}</div>
        </div>
      </div>
      <div className="card overflow-x-auto">
        {ledger.length === 0 ? (
          <Empty>No stock movements yet. Stock is added when a warehouse PO delivery is recorded, or with an adjustment.</Empty>
        ) : (
          <table className="table min-w-[820px]">
            <thead>
              <tr><th>Date</th><th>Type</th><th className="num">Qty</th><th className="num">Balance</th><th>Reference / client</th><th>Notes</th><th>By</th><th></th></tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap">{fmtDate(r.movementDate)}</td>
                  <td><MovementType type={r.type} /></td>
                  <td className={`num ${r.quantity < 0 ? "text-red-700" : "text-emerald-700"}`}>{r.quantity > 0 ? "+" : ""}{num(r.quantity)}</td>
                  <td className="num font-medium">{num(r.balance)}</td>
                  <td>
                    <MovementRef m={r} />
                  </td>
                  <td className="max-w-xs text-slate-600">{r.notes ?? ""}</td>
                  <td className="whitespace-nowrap">{r.byName ?? "—"}</td>
                  <td>
                    {reversed.has(r.id) ? (
                      <span className="text-xs text-slate-500">Reversed</span>
                    ) : (
                      user.role === "ADMIN" && r.type === "ADJUST" && !r.reversalOfId && (
                        <details className="relative">
                          <summary className="btn btn-sm cursor-pointer list-none">Reverse</summary>
                          <form action={reverseMovement.bind(null, r.id, id)} className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                            <label className="label" htmlFor={`reason-${r.id}`}>Reason *</label>
                            <input id={`reason-${r.id}`} name="reason" className="input" required maxLength={2000} placeholder="e.g. entered twice, wrong material" />
                            <p className="text-xs text-slate-500">Adds an opposite adjustment. The original stays in the history.</p>
                            <button className="btn btn-sm btn-danger">Reverse adjustment</button>
                          </form>
                        </details>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
