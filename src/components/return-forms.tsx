"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions/inventory";
import { num } from "@/lib/format";
import { useFormAction } from "./client-ui";

export type JoMaterialRow = { materialId: number; description: string; spec: string | null; unit: string; issued: number; returned: number; out: number };

/** Job order page: issued / returned / still out per material, and a "Remove now" quantity for each. */
export function JobOrderReturnForm({
  action,
  materials,
  today,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  materials: JoMaterialRow[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [qty, setQty] = useState<Record<number, string>>({});
  const lines = materials
    .filter((m) => Number(qty[m.materialId]) > 0)
    .map((m) => ({ materialId: m.materialId, quantity: Number(qty[m.materialId]) }));
  const over = materials.some((m) => Number(qty[m.materialId]) > m.out);

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <table className="table">
        <thead>
          <tr><th>Material</th><th className="num">Issued</th><th className="num">Returned</th><th className="num">Still out</th><th className="num w-44">Remove now</th></tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const bad = Number(qty[m.materialId]) > m.out;
            return (
              <tr key={m.materialId}>
                <td>{m.description}{m.spec && <span className="text-slate-500"> · {m.spec}</span>}</td>
                <td className="num">{num(m.issued)}</td>
                <td className="num">{m.returned ? num(m.returned) : "—"}</td>
                <td className="num font-medium">{num(m.out)} {m.unit}</td>
                <td>
                  {m.out > 0 ? (
                    <div className="flex items-center justify-end gap-1">
                      <input className={`input w-24 text-right ${bad ? "border-red-500" : ""}`} type="number" min={0} step="0.01" inputMode="decimal"
                        value={qty[m.materialId] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [m.materialId]: e.target.value }))}
                        aria-label={`Remove ${m.description}`} />
                      <button type="button" className="btn btn-sm" onClick={() => setQty((q) => ({ ...q, [m.materialId]: String(m.out) }))}>All</button>
                    </div>
                  ) : (
                    <div className="text-right text-xs text-slate-400">All returned</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="returnDate">Date *</label>
          <input id="returnDate" name="movementDate" type="date" className="input" defaultValue={today} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="returnNotes">Reason *</label>
          <input id="returnNotes" name="notes" className="input" required maxLength={2000} placeholder="e.g. unused, returned to warehouse; wrong item" />
        </div>
      </div>
      {over && <p className="error-box">You can’t remove more than is still out.</p>}
      {state.error && <p className="error-box">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending || lines.length === 0 || over}>
        {pending ? "Saving…" : "Remove & return to stock"}
      </button>
    </form>
  );
}

/** Client page: a small "Remove" popover for one material, returned from the client's newest job orders first. */
export function ClientReturnButton({
  action,
  unit,
  max,
  today,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  unit: string;
  /** Still out on the client's job orders. */
  max: number;
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [open, setOpen] = useState(false);
  if (max <= 0) return null;
  return (
    <div className="relative inline-block text-left">
      <button type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)}>Remove</button>
      {open && (
        <form onSubmit={onSubmit} className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <label className="label" htmlFor="rq">Quantity * <span className="font-normal text-slate-500">(up to {num(max)} {unit})</span></label>
          <input id="rq" name="quantity" type="number" min={0} max={max} step="0.01" inputMode="decimal" className="input text-right" required />
          <label className="label" htmlFor="rd">Date *</label>
          <input id="rd" name="movementDate" type="date" className="input" defaultValue={today} required />
          <label className="label" htmlFor="rn">Reason *</label>
          <input id="rn" name="notes" className="input" required maxLength={2000} placeholder="e.g. unused, returned to warehouse" />
          {state.error && <p className="error-box">{state.error}</p>}
          {state.ok && <p className="ok-box">{state.ok}</p>}
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={pending}>{pending ? "Saving…" : "Return to stock"}</button>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}
