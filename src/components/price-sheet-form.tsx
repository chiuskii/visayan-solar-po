"use client";

import { useMemo, useState } from "react";
import type { FormState } from "@/app/actions/inventory";
import { num } from "@/lib/format";
import { useFormAction } from "./client-ui";

export type PriceOpt = { id: number; name: string; spec: string | null; category: string | null; unit: string; defaultCost: number; onHand: number; lastPoPrice: number | null };

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every material's price on one sheet. Only changed rows are saved. */
export function PriceSheetForm({ action, materials }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; materials: PriceOpt[] }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [prices, setPrices] = useState<Record<number, string>>(() => Object.fromEntries(materials.map((m) => [m.id, String(m.defaultCost)])));
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [onlyZero, setOnlyZero] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [pct, setPct] = useState("");

  const value = (m: PriceOpt) => Number(prices[m.id]);
  const isChanged = (m: PriceOpt) => prices[m.id] !== "" && value(m) !== m.defaultCost;
  const categories = useMemo(() => [...new Set(materials.map((m) => m.category).filter((c): c is string => !!c))].sort(), [materials]);
  const needle = q.trim().toLowerCase();
  const shown = materials.filter(
    (m) =>
      (!category || m.category === category) &&
      (!needle || `${m.name} ${m.spec ?? ""}`.toLowerCase().includes(needle)) &&
      (!onlyZero || m.defaultCost === 0) &&
      (!onlyChanged || isChanged(m)),
  );
  const changed = materials.filter(isChanged);
  const invalid = materials.some((m) => prices[m.id] === "" || !Number.isFinite(value(m)) || value(m) < 0);

  function applyPct() {
    const p = Number(pct);
    if (!Number.isFinite(p) || p === 0) return;
    setPrices((cur) => {
      const next = { ...cur };
      for (const m of shown) next[m.id] = String(r2(m.defaultCost * (1 + p / 100)));
      return next;
    });
    setPct("");
  }
  const useLastPo = () =>
    setPrices((cur) => {
      const next = { ...cur };
      for (const m of shown) if (m.lastPoPrice !== null && m.lastPoPrice > 0) next[m.id] = String(m.lastPoPrice);
      return next;
    });
  const reset = () => setPrices(Object.fromEntries(materials.map((m) => [m.id, String(m.defaultCost)])));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="prices" value={JSON.stringify(changed.map((m) => ({ materialId: m.id, defaultCost: value(m) })))} />

      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find material" />
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyZero} onChange={(e) => setOnlyZero(e.target.checked)} /> No price (₱0)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Changed</label>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="text-slate-600">For the {shown.length} shown:</span>
        <input className="input w-24 text-right" type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="+5" aria-label="Percent change" />
        <span>%</span>
        <button type="button" className="btn btn-sm" onClick={applyPct} disabled={!Number(pct)}>Apply % change</button>
        <button type="button" className="btn btn-sm" onClick={useLastPo}>Use latest PO price</button>
        <button type="button" className="btn btn-sm" onClick={reset} disabled={changed.length === 0}>Undo all changes</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[720px]">
          <thead>
            <tr><th>Material</th><th>Category</th><th className="num">On hand</th><th className="num">Latest PO price</th><th className="num">Current</th><th className="num w-44">New price</th></tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id}>
                <td>{m.name}{m.spec && <span className="text-slate-500"> · {m.spec}</span>} <span className="text-xs text-slate-400">/ {m.unit}</span></td>
                <td>{m.category ?? "—"}</td>
                <td className="num">{num(m.onHand)}</td>
                <td className="num text-slate-600">{m.lastPoPrice !== null ? peso(m.lastPoPrice) : "—"}</td>
                <td className={`num ${m.defaultCost === 0 ? "text-amber-700" : "text-slate-600"}`}>{peso(m.defaultCost)}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-slate-500">₱</span>
                    <input className={`input w-32 text-right ${isChanged(m) ? "border-amber-400 bg-amber-50" : ""}`} type="number" min={0} step="0.01" inputMode="decimal"
                      value={prices[m.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [m.id]: e.target.value }))} aria-label={`Price of ${m.name}`} />
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>

      {invalid && <p className="error-box">Prices must be 0 or more.</p>}
      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || changed.length === 0 || invalid}>
          {pending ? "Saving…" : `Save ${changed.length} price${changed.length === 1 ? "" : "s"}`}
        </button>
        <span className="text-sm text-slate-500">Changes the cost in Materials. Prices already assigned to clients stay as they are.</span>
      </div>
    </form>
  );
}
