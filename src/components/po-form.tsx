"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormAction } from "./client-ui";
import { blankLine, isBlankLine, lineAmount, LineItemsTable, linesJson, newKey, r2, type Line, type MaterialOpt } from "./line-items";
import type { FormState } from "@/app/actions/pos";
import { peso } from "@/lib/format";

type Option = { id: number; name: string };
type ClientOpt = Option & { address: string | null };
type SupplierOpt = Option & { paymentTerms: string | null };
export type BundleOpt = {
  id: number;
  name: string;
  items: { supplierId: number | null; materialId: number | null; description: string; spec: string | null; unit: string; quantity: number; unitCost: number }[];
};

export type PoFormValues = {
  clientId: number | "";
  toWarehouse: boolean;
  poDate: string;
  expectedDate: string;
  deliveryAddress: string;
  terms: string;
  notes: string;
  vatRate: number;
  discount: number;
  items: Line[];
};

export function PoForm({
  action,
  initial,
  clients,
  suppliers,
  materials,
  bundles,
  isEdit,
  cancelHref,
  requireApproval = false,
  approvalNotice,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: PoFormValues;
  clients: ClientOpt[];
  suppliers: SupplierOpt[];
  materials: MaterialOpt[];
  bundles: BundleOpt[];
  isEdit: boolean;
  cancelHref: string;
  /** "Save & submit for approval" instead of "Save & mark as ordered". */
  requireApproval?: boolean;
  /** Shown above the save buttons, e.g. that saving withdraws the approval. */
  approvalNotice?: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [lines, setLines] = useState<Line[]>(initial.items.length ? initial.items : [blankLine()]);
  const [clientId, setClientId] = useState<number | "">(initial.clientId);
  const [deliveryAddress, setDeliveryAddress] = useState(initial.deliveryAddress);
  const [terms, setTerms] = useState(initial.terms);
  const [vatRate, setVatRate] = useState(String(initial.vatRate));
  const [discount, setDiscount] = useState(initial.discount ? String(initial.discount) : "");

  const totals = useMemo(() => {
    const subtotal = r2(lines.reduce((s, l) => s + lineAmount(l), 0));
    const net = r2(Math.max(0, subtotal - (Number(discount) || 0)));
    const vat = r2((net * (Number(vatRate) || 0)) / 100);
    return { subtotal, net, vat, total: r2(net + vat) };
  }, [lines, discount, vatRate]);

  // Per-supplier subtotals, shown when the PO buys from more than one supplier.
  const supplierSubtotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of lines) {
      if (l.supplierId === "") continue;
      map.set(l.supplierId, (map.get(l.supplierId) ?? 0) + lineAmount(l));
    }
    return [...map.entries()].map(([id, amount]) => ({ name: suppliers.find((s) => s.id === id)?.name ?? "—", amount: r2(amount) }));
  }, [lines, suppliers]);

  // New lines start with the previous line's supplier.
  const addLine = () => setLines((ls) => [...ls, blankLine(ls.at(-1)?.supplierId ?? "")]);

  const [bundleId, setBundleId] = useState("");
  const [bundleQty, setBundleQty] = useState("1");
  const [bundleNote, setBundleNote] = useState("");
  // Copies a bundle's lines onto the PO (quantities × the multiplier), replacing any empty rows.
  function addBundle() {
    const b = bundles.find((x) => x.id === Number(bundleId));
    const mult = Number(bundleQty) || 1;
    if (!b) return;
    const added: Line[] = b.items.map((it) => ({
      key: newKey(),
      supplierId: it.supplierId ?? "",
      materialId: it.materialId,
      description: it.description,
      spec: it.spec ?? "",
      unit: it.unit,
      quantity: String(r2(it.quantity * mult)),
      unitCost: String(it.unitCost),
    }));
    setLines((ls) => [...ls.filter((l) => !isBlankLine(l)), ...added]);
    const missing = added.filter((l) => l.supplierId === "").length;
    setBundleNote(
      `Added ${added.length} lines from “${b.name}”${mult !== 1 ? ` × ${mult}` : ""}.` +
        (missing ? ` ${missing} ${missing === 1 ? "line needs" : "lines need"} a supplier.` : ""),
    );
    setBundleId("");
    setBundleQty("1");
  }

  function pickClient(value: string) {
    const id = value ? Number(value) : "";
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c?.address && !deliveryAddress) setDeliveryAddress(c.address);
  }

  const itemsJson = linesJson(lines);

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
          <input id="terms" name="terms" className="input" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Blank = each supplier’s own terms" />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" name="toWarehouse" defaultChecked={initial.toWarehouse} className="mt-0.5" />
          <span>
            <b>Deliver to warehouse</b> — received quantities are added to Inventory stock. Leave unticked for direct-to-site deliveries.
          </span>
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="deliveryAddress">Deliver to</label>
          <textarea id="deliveryAddress" name="deliveryAddress" rows={2} className="input" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Project site or warehouse address" />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2>Materials</h2>
          <div className="flex flex-wrap items-center gap-2">
            {bundles.length > 0 && (
              <>
                <select className="input w-56" value={bundleId} onChange={(e) => setBundleId(e.target.value)} aria-label="Bundle">
                  <option value="">Add a bundle…</option>
                  {bundles.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.items.length} items)</option>
                  ))}
                </select>
                <span className="text-sm text-slate-500">×</span>
                <input className="input w-16 text-right" type="number" min={1} step="1" value={bundleQty} onChange={(e) => setBundleQty(e.target.value)} aria-label="How many of this bundle" />
                <button type="button" className="btn btn-sm" onClick={addBundle} disabled={!bundleId}>Add bundle</button>
              </>
            )}
            <button type="button" className="btn btn-sm" onClick={addLine}>+ Add line</button>
          </div>
        </div>
        {bundleNote && <p className="border-b border-slate-200 bg-brand-50 px-4 py-2 text-sm">{bundleNote}</p>}
        {suppliers.length === 0 && (
          <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
            No suppliers yet — <Link className="text-brand-600 underline" href="/suppliers/new">add one</Link> before creating a PO.
          </p>
        )}
        <LineItemsTable lines={lines} setLines={setLines} materials={materials} suppliers={suppliers} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card p-5">
          <label className="label" htmlFor="notes">Notes / special instructions</label>
          <textarea id="notes" name="notes" rows={5} className="input" defaultValue={initial.notes} />
        </div>
        <div className="card space-y-3 p-5 text-sm">
          {supplierSubtotals.length > 1 &&
            supplierSubtotals.map((s) => (
              <div key={s.name} className="flex justify-between text-xs text-slate-500">
                <span>{s.name}</span><span className="tabular-nums">{peso(s.amount)}</span>
              </div>
            ))}
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
      {approvalNotice && <p className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">{approvalNotice}</p>}

      <div className="flex flex-wrap gap-2">
        {isEdit ? (
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        ) : (
          <>
            <button className="btn btn-primary" name="intent" value="order" disabled={pending}>{pending ? "Saving…" : requireApproval ? "Save & submit for approval" : "Save & mark as ordered"}</button>
            <button className="btn" name="intent" value="draft" disabled={pending}>Save as draft</button>
          </>
        )}
        <Link href={cancelHref} className="btn">Cancel</Link>
      </div>
    </form>
  );
}
