import Link from "next/link";
import type { StockType } from "@/db/types";
import { stockStatus, type MovementRow, type StockRow } from "@/lib/inventory";

const TYPE_STYLE: Record<StockType, [string, string]> = {
  RECEIVE: ["Received", "bg-emerald-50 text-emerald-700"],
  ISSUE: ["Assigned", "bg-blue-50 text-blue-700"],
  RETURN: ["Returned", "bg-violet-50 text-violet-700"],
  ADJUST: ["Adjusted", "bg-slate-100 text-slate-700"],
};

export function MovementType({ type }: { type: StockType }) {
  const [label, cls] = TYPE_STYLE[type];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

export function StockBadge({ row }: { row: Pick<StockRow, "onHand" | "reorderLevel" | "lastMovement"> }) {
  if (!row.lastMovement && row.onHand === 0) return <span className="text-xs text-slate-400">Not stocked</span>;
  const s = stockStatus(row);
  if (s === "out") return <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Out</span>;
  if (s === "low") return <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Low</span>;
  return <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">In stock</span>;
}

/** Where a movement came from or went: its PO, or its job order and client, else its reference. */
export function MovementRef({ m, fallback }: { m: Pick<MovementRow, "poId" | "reference" | "jobOrderId" | "joNumber" | "clientName">; fallback?: string | null }) {
  if (m.poId) return <Link className="text-brand-700 hover:underline" href={`/pos/${m.poId}`}>{m.reference}</Link>;
  if (m.jobOrderId) {
    const extra = [m.clientName, m.reference !== m.joNumber ? m.reference : null].filter(Boolean).join(" · ");
    return (
      <>
        <Link className="text-brand-700 hover:underline" href={`/inventory/job-orders/${m.jobOrderId}`}>{m.joNumber}</Link>
        {extra && <span className="text-slate-600"> · {extra}</span>}
      </>
    );
  }
  return <>{[m.clientName, m.reference].filter(Boolean).join(" · ") || fallback || "—"}</>;
}

export function JoStatusBadge({ status }: { status: string }) {
  return status === "CANCELLED" ? (
    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Cancelled</span>
  ) : (
    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">Issued</span>
  );
}
