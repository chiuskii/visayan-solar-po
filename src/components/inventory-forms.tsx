"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormState } from "@/app/actions/inventory";
import { num } from "@/lib/format";
import { useFormAction } from "./client-ui";

export type StockOpt = { id: number; name: string; spec: string | null; unit: string; onHand: number };
export type IssueBundleOpt = { id: number; name: string; items: { materialId: number | null; quantity: number }[] };

const label = (m: StockOpt) => `${m.name}${m.spec ? ` (${m.spec})` : ""}`;

/** Issue several materials to a client / project in one go. */
export function IssueForm({
  action,
  materials,
  clients,
  bundles,
  today,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  materials: StockOpt[];
  clients: { id: number; name: string }[];
  bundles: IssueBundleOpt[];
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [lines, setLines] = useState([{ key: 1, materialId: "", quantity: "" }]);
  const [bundleId, setBundleId] = useState("");
  const [bundleQty, setBundleQty] = useState("1");
  const [bundleNote, setBundleNote] = useState("");
  // Choices: what's in stock, plus anything already on a line (e.g. added from a bundle while out of stock).
  const chosen = new Set(lines.map((l) => Number(l.materialId)));
  const choices = materials.filter((m) => m.onHand > 0 || chosen.has(m.id));
  const anyInStock = materials.some((m) => m.onHand > 0);

  // Adds a bundle's materials (× the multiplier), merging into lines that already have that material.
  function addBundle() {
    const b = bundles.find((x) => x.id === Number(bundleId));
    if (!b) return;
    const mult = Number(bundleQty) || 1;
    const totals = new Map<number, number>();
    for (const it of b.items) {
      if (it.materialId && materials.some((m) => m.id === it.materialId)) {
        totals.set(it.materialId, (totals.get(it.materialId) ?? 0) + it.quantity * mult);
      }
    }
    const skipped = b.items.length - b.items.filter((it) => it.materialId && totals.has(it.materialId)).length;
    setLines((ls) => {
      const next = ls.filter((l) => l.materialId || l.quantity).map((l) => ({ ...l }));
      let key = Math.max(0, ...ls.map((l) => l.key));
      for (const [materialId, qty] of totals) {
        const existing = next.find((l) => Number(l.materialId) === materialId);
        const q = Math.round(qty * 100) / 100;
        if (existing) existing.quantity = String(Math.round(((Number(existing.quantity) || 0) + q) * 100) / 100);
        else next.push({ key: ++key, materialId: String(materialId), quantity: String(q) });
      }
      return next.length ? next : [{ key: key + 1, materialId: "", quantity: "" }];
    });
    const short = [...totals].filter(([id, qty]) => qty > (materials.find((m) => m.id === id)?.onHand ?? 0)).length;
    setBundleNote(
      `Added ${totals.size} materials from “${b.name}”${mult !== 1 ? ` × ${mult}` : ""}.` +
        (short ? ` ${short} ${short === 1 ? "is" : "are"} short on stock (marked in red).` : "") +
        (skipped ? ` ${skipped} custom ${skipped === 1 ? "line isn’t" : "lines aren’t"} tracked in stock and ${skipped === 1 ? "was" : "were"} skipped.` : ""),
    );
    setBundleId("");
    setBundleQty("1");
  }
  const update = (key: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const json = JSON.stringify(
    lines.filter((l) => l.materialId || l.quantity).map((l) => ({ materialId: Number(l.materialId) || 0, quantity: Number(l.quantity) || 0 })),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="lines" value={json} />
      <section className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="clientId">Client / project</label>
          <select id="clientId" name="clientId" className="input" defaultValue="">
            <option value="">— None (enter a reference) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="movementDate">Date *</label>
          <input id="movementDate" name="movementDate" type="date" className="input" defaultValue={today} required />
        </div>
        <div>
          <label className="label" htmlFor="reference">Reference</label>
          <input id="reference" name="reference" className="input" placeholder="e.g. Job order / DR no." maxLength={120} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor="notes">Notes</label>
          <input id="notes" name="notes" className="input" maxLength={2000} />
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2>Materials to issue</h2>
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
            <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, materialId: "", quantity: "" }])}>
              + Add line
            </button>
          </div>
        </div>
        {bundleNote && <p className="border-b border-slate-200 bg-brand-50 px-4 py-2 text-sm">{bundleNote}</p>}
        {!anyInStock ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nothing is in stock yet. Stock comes in from warehouse PO deliveries, or from an adjustment.</p>
        ) : (
          <table className="table min-w-[560px]">
            <thead>
              <tr><th>Material</th><th className="num w-32">On hand</th><th className="num w-40">Issue qty</th><th className="w-10"></th></tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const m = materials.find((x) => x.id === Number(l.materialId));
                const over = m && Number(l.quantity) > m.onHand;
                return (
                  <tr key={l.key}>
                    <td>
                      <select className="input" value={l.materialId} onChange={(e) => update(l.key, { materialId: e.target.value })} aria-label="Material">
                        <option value="">Choose…</option>
                        {choices.map((x) => (
                          <option key={x.id} value={x.id}>{label(x)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num">{m ? `${num(m.onHand)} ${m.unit}` : "—"}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <input className={`input text-right ${over ? "border-red-500" : ""}`} type="number" min={0} step="0.01" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} aria-label="Quantity" />
                        {m && <button type="button" className="btn btn-sm" onClick={() => update(l.key, { quantity: String(m.onHand) })} title="Issue everything on hand">All</button>}
                      </div>
                      {over && <div className="mt-0.5 text-right text-[11px] text-red-600">More than on hand</div>}
                    </td>
                    <td>
                      <button type="button" className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: l.key + 1, materialId: "", quantity: "" }]))} aria-label="Remove line">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || !anyInStock}>{pending ? "Saving…" : "Issue materials"}</button>
        <Link href="/inventory" className="btn">Cancel</Link>
      </div>
    </form>
  );
}

/** Set stock to a counted quantity, or add / remove an amount. */
export function AdjustForm({
  action,
  materials,
  initialMaterialId,
  today,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  materials: StockOpt[];
  initialMaterialId?: number;
  today: string;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [materialId, setMaterialId] = useState(initialMaterialId ? String(initialMaterialId) : "");
  const [mode, setMode] = useState<"set" | "change">("set");
  const [qty, setQty] = useState("");
  const m = materials.find((x) => x.id === Number(materialId));
  const after = m && qty !== "" ? (mode === "set" ? Number(qty) : m.onHand + Number(qty)) : null;

  return (
    <form onSubmit={onSubmit} className="card max-w-2xl space-y-4 p-5">
      <div>
        <label className="label" htmlFor="materialId">Material *</label>
        <select id="materialId" name="materialId" className="input" value={materialId} onChange={(e) => setMaterialId(e.target.value)} required>
          <option value="">Choose…</option>
          {materials.map((x) => (
            <option key={x.id} value={x.id}>{label(x)} — {num(x.onHand)} {x.unit} on hand</option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="set" checked={mode === "set"} onChange={() => setMode("set")} /> Set to counted quantity
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="change" checked={mode === "change"} onChange={() => setMode("change")} /> Add / remove (use − to remove)
        </label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="quantity">{mode === "set" ? "Counted quantity *" : "Change (+ / −) *"}</label>
          <input id="quantity" name="quantity" type="number" step="0.01" inputMode="decimal" className="input text-right" min={mode === "set" ? 0 : undefined} value={qty} onChange={(e) => setQty(e.target.value)} required />
          {m && after !== null && Number.isFinite(after) && (
            <p className={`mt-1 text-xs ${after < 0 ? "text-red-600" : "text-slate-500"}`}>
              On hand: {num(m.onHand)} → {num(after)} {m.unit}
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="movementDate">Date *</label>
          <input id="movementDate" name="movementDate" type="date" className="input" defaultValue={today} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Reason *</label>
        <input id="notes" name="notes" className="input" required maxLength={2000} placeholder="e.g. Physical count, damaged in storage, opening stock" />
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save adjustment"}</button>
        <Link href={m ? `/inventory/${m.id}` : "/inventory"} className="btn">Cancel</Link>
      </div>
    </form>
  );
}
