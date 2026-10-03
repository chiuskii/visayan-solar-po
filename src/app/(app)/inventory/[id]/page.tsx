import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMovement } from "@/app/actions/inventory";
import { ConfirmButton } from "@/components/client-ui";
import { MovementType, StockBadge } from "@/components/stock-ui";
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
      {error === "negative" && <p className="error-box mb-4">Removing that would leave stock below zero, so it was kept.</p>}
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
                    {r.poId ? <Link className="text-brand-700 hover:underline" href={`/pos/${r.poId}`}>{r.reference}</Link> : [r.clientName, r.reference].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="max-w-xs text-slate-600">{r.notes ?? ""}</td>
                  <td className="whitespace-nowrap">{r.byName ?? "—"}</td>
                  <td>
                    {user.role === "ADMIN" && r.type !== "RECEIVE" && (
                      <ConfirmButton action={deleteMovement.bind(null, r.id, id)} label="Remove" confirmLabel="Remove" className="btn btn-sm btn-danger" />
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
