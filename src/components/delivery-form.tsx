"use client";

import { useFormAction } from "./client-ui";
import type { FormState } from "@/app/actions/pos";
import { num } from "@/lib/format";

type Item = { id: number; supplierName: string; description: string; spec: string | null; unit: string; quantity: number; received: number; balance: number };

export function DeliveryForm({
  action,
  items,
  today,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  items: Item[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const open = items.filter((i) => i.balance > 0);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="deliveryDate">Date received *</label>
          <input id="deliveryDate" name="deliveryDate" type="date" className="input" defaultValue={today} required />
        </div>
        <div>
          <label className="label" htmlFor="drNumber">DR / invoice no.</label>
          <input id="drNumber" name="drNumber" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="receivedBy">Received by</label>
          <input id="receivedBy" name="receivedBy" className="input" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[520px]">
          <thead>
            <tr><th>Material</th><th className="num">Ordered</th><th className="num">Balance</th><th className="num w-44">Received now</th></tr>
          </thead>
          <tbody>
            {open.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.description}{i.spec ? <span className="text-slate-500"> · {i.spec}</span> : null}
                  <div className="text-xs text-slate-500">{i.supplierName}</div>
                </td>
                <td className="num">{num(i.quantity)} {i.unit}</td>
                <td className="num font-medium text-amber-700">{num(i.balance)}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <input name={`qty_${i.id}`} type="number" min={0} max={i.balance} step="0.01" inputMode="decimal" className="input text-right" aria-label={`Quantity received for ${i.description}`} />
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="Fill full balance"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        input.value = String(i.balance);
                      }}
                    >
                      All
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <label className="label" htmlFor="dnotes">Notes</label>
        <input id="dnotes" name="notes" className="input" placeholder="e.g. 1 panel with cracked frame, for replacement" />
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save delivery"}</button>
    </form>
  );
}
