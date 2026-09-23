"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormAction } from "./client-ui";
import type { FormState } from "@/app/actions/pos";
import { peso } from "@/lib/format";

type Option = { id: number; name: string };
type ClientOpt = Option & { address: string | null };
type SupplierOpt = Option & { paymentTerms: string | null };
type MaterialOpt = { id: number; name: string; spec: string | null; unit: string; defaultCost: number };

export type PoFormValues = {
  clientId: number | "";
  supplierId: number | "";
  poDate: string;
  expectedDate: string;
  deliveryAddress: string;
  terms: string;
  notes: string;
  vatRate: number;
  discount: number;
  items: Line[];
};

type Line = {
  key: string;
  id?: number;
  materialId: number | null;
  description: string;
  spec: string;
  unit: string;
  quantity: string;
  unitCost: string;
  received?: number;
};

let keySeq = 0;
const newKey = () => `n${++keySeq}`;
export const blankLine = (): Line => ({ key: newKey(), materialId: null, description: "", spec: "", unit: "pcs", quantity: "", unitCost: "" });

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function PoForm({
  action,
  initial,
  clients,
  suppliers,
  materials,
  isEdit,
  cancelHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: PoFormValues;
  clients: ClientOpt[];
  suppliers: SupplierOpt[];
  materials: MaterialOpt[];
  isEdit: boolean;
  cancelHref: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [lines, setLines] = useState<Line[]>(initial.items.length ? initial.items : [blankLine()]);
  const [clientId, setClientId] = useState<number | "">(initial.clientId);
  const [deliveryAddress, setDeliveryAddress] = useState(initial.deliveryAddress);
  const [terms, setTerms] = useState(initial.terms);
  const [vatRate, setVatRate] = useState(String(initial.vatRate));
  const [discount, setDiscount] = useState(initial.discount ? String(initial.discount) : "");

  const totals = useMemo(() => {
    const subtotal = r2(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0));
    const net = r2(Math.max(0, subtotal - (Number(discount) || 0)));
    const vat = r2((net * (Number(vatRate) || 0)) / 100);
    return { subtotal, net, vat, total: r2(net + vat) };
  }, [lines, discount, vatRate]);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickMaterial(key: string, value: string) {
    if (!value) return update(key, { materialId: null });
    const m = materials.find((x) => x.id === Number(value));
    if (!m) return;
    update(key, { materialId: m.id, description: m.name, spec: m.spec ?? "", unit: m.unit, unitCost: m.defaultCost ? String(m.defaultCost) : "" });
  }

  function pickClient(value: string) {
    const id = value ? Number(value) : "";
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c?.address && !deliveryAddress) setDeliveryAddress(c.address);
  }

  function pickSupplier(value: string) {
    const s = suppliers.find((x) => x.id === Number(value));
    if (s?.paymentTerms && !terms) setTerms(s.paymentTerms);
  }

  const itemsJson = JSON.stringify(
    lines
      .filter((l) => l.description.trim() || l.quantity || l.unitCost)
      .map((l) => ({
        id: l.id,
        materialId: l.materialId,
        description: l.description,
        spec: l.spec,
        unit: l.unit,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost || 0),
      })),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="items" value={itemsJson} />

      <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="clientId">Client *</label>
          <select id="clientId" name="clientId" className="input" value={clientId} onChange={(e) => pickClient(e.target.value)} required>
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {clients.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">No clients yet — <Link className="text-brand-600 underline" href="/clients/new">add one</Link>.</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="supplierId">Supplier *</label>
          <select id="supplierId" name="supplierId" className="input" defaultValue={initial.supplierId} onChange={(e) => pickSupplier(e.target.value)} required>
            <option value="">Choose a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {suppliers.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">No suppliers yet — <Link className="text-brand-600 underline" href="/suppliers/new">add one</Link>.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="poDate">PO date *</label>
          <input id="poDate" name="poDate" type="date" className="input" defaultValue={initial.poDate} required />
        </div>
        <div>
          <label className="label" htmlFor="expectedDate">Expected delivery</label>
          <input id="expectedDate" name="expectedDate" type="date" className="input" defaultValue={initial.expectedDate} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="terms">Payment terms</label>
          <input id="terms" name="terms" className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 30 days, 50% DP" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="deliveryAddress">Deliver to</label>
          <textarea id="deliveryAddress" name="deliveryAddress" rows={2} className="input" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Project site or warehouse address" />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2>Materials</h2>
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        </div>
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th className="w-56">Pick from list</th>
              <th>Description *</th>
              <th className="w-36">Brand / spec</th>
              <th className="w-20">Unit</th>
              <th className="num w-24">Qty</th>
              <th className="num w-32">Unit cost (₱)</th>
              <th className="num w-32">Amount</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const amount = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
              const locked = (l.received ?? 0) > 0;
              return (
                <tr key={l.key}>
                  <td>
                    <select className="input" value={l.materialId ?? ""} onChange={(e) => pickMaterial(l.key, e.target.value)} aria-label="Material">
                      <option value="">— Custom item —</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}{m.spec ? ` (${m.spec})` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td><input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} aria-label="Description" /></td>
                  <td><input className="input" value={l.spec} onChange={(e) => update(l.key, { spec: e.target.value })} aria-label="Spec" /></td>
                  <td><input className="input" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} aria-label="Unit" /></td>
                  <td>
                    <input className="input text-right" type="number" min={locked ? l.received : 0} step="0.01" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} aria-label="Quantity" />
                    {locked && <div className="mt-0.5 text-right text-[11px] text-amber-700">{l.received} received</div>}
                  </td>
                  <td><input className="input text-right" type="number" min={0} step="0.01" inputMode="decimal" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value })} aria-label="Unit cost" /></td>
                  <td className="num">{peso(amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                      disabled={locked}
                      title={locked ? "Has deliveries — can’t remove" : "Remove line"}
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <label className="label" htmlFor="notes">Notes / special instructions</label>
          <textarea id="notes" name="notes" rows={5} className="input" defaultValue={initial.notes} />
        </div>
        <div className="card space-y-3 p-5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{peso(totals.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="discount" className="text-slate-500">Discount (₱)</label>
            <input id="discount" name="discount" type="number" min={0} step="0.01" className="input w-36 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="vatRate" className="text-slate-500">VAT</label>
            <select id="vatRate" name="vatRate" className="input w-36" value={vatRate} onChange={(e) => setVatRate(e.target.value)}>
              <option value="0">None / VAT-inclusive</option>
              <option value="12">Add 12% VAT</option>
            </select>
          </div>
          {totals.vat > 0 && <div className="flex justify-between"><span className="text-slate-500">VAT</span><span className="tabular-nums">{peso(totals.vat)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
            <span>Total</span><span className="tabular-nums">{peso(totals.total)}</span>
          </div>
        </div>
      </section>

      {state.error && <p className="error-box">{state.error}</p>}

      <div className="flex flex-wrap gap-2">
        {isEdit ? (
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        ) : (
          <>
            <button className="btn btn-primary" name="intent" value="order" disabled={pending}>{pending ? "Saving…" : "Save & mark as ordered"}</button>
            <button className="btn" name="intent" value="draft" disabled={pending}>Save as draft</button>
          </>
        )}
        <Link href={cancelHref} className="btn">Cancel</Link>
      </div>
    </form>
  );
}
