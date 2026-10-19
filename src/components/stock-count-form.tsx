"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormState } from "@/app/actions/inventory";
import { num } from "@/lib/format";
import { useFormAction } from "./client-ui";

export type CountOpt = { id: number; name: string; spec: string | null; category: string | null; unit: string; onHand: number };

const DRAFT_KEY = "stockCount.draft";

/** One sheet for counting every material. Blank rows are not counted; counted rows are set to the count. */
export function StockCountForm({
  action,
  materials,
  today,
  justSaved,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  materials: CountOpt[];
  today: string;
  /** The page was reached right after a save: the draft has been saved, so discard it. */
  justSaved: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [blind, setBlind] = useState(false);
  const [onlyLeft, setOnlyLeft] = useState(false);

  // Keep typed counts in this browser until they're saved, so a reload doesn't lose them.
  useEffect(() => {
    try {
      if (justSaved) localStorage.removeItem(DRAFT_KEY);
      else {
        const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
        if (saved && typeof saved === "object") setCounts(saved);
      }
    } catch {
      // storage unavailable: start empty
    }
  }, [justSaved]);
  function setCount(id: number, v: string) {
    setCounts((c) => {
      const next = { ...c, [id]: v };
      if (v === "") delete next[id];
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const categories = useMemo(() => [...new Set(materials.map((m) => m.category).filter((c): c is string => !!c))].sort(), [materials]);
  const counted = materials.filter((m) => (counts[m.id] ?? "") !== "");
  const needle = q.trim().toLowerCase();
  const shown = materials.filter(
    (m) =>
      (!category || m.category === category) &&
      (!needle || `${m.name} ${m.spec ?? ""}`.toLowerCase().includes(needle)) &&
      (!onlyLeft || (counts[m.id] ?? "") === ""),
  );
  const lines = counted.map((m) => ({ materialId: m.id, counted: Number(counts[m.id]) }));
  const invalid = lines.some((l) => !Number.isFinite(l.counted) || l.counted < 0);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="movementDate">Count date *</label>
          <input id="movementDate" name="movementDate" type="date" className="input" defaultValue={today} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Counted by / witnessed by *</label>
          <input id="notes" name="notes" className="input" required maxLength={2000} placeholder="e.g. Full count — counted by Darwin, witnessed by Apol" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find material" />
        <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyLeft} onChange={(e) => setOnlyLeft(e.target.checked)} /> Not counted yet
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Hide system quantities (blind count)
        </label>
        <span className="ml-auto text-sm text-slate-600">
          <b>{counted.length}</b> of {materials.length} counted
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th>Material</th><th>Category</th>
              {!blind && <th className="num">System on hand</th>}
              <th className="num w-40">Counted</th>
              {!blind && <th className="num">Difference</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const raw = counts[m.id] ?? "";
              const diff = raw === "" ? null : Math.round((Number(raw) - m.onHand) * 100) / 100;
              return (
                <tr key={m.id}>
                  <td>{m.name}{m.spec && <span className="text-slate-500"> · {m.spec}</span>}</td>
                  <td>{m.category ?? "—"}</td>
                  {!blind && <td className={`num ${m.onHand < 0 ? "text-red-600" : ""}`}>{num(m.onHand)} {m.unit}</td>}
                  <td className="num">
                    <div className="flex items-center justify-end gap-1">
                      <input type="number" step="0.01" min={0} inputMode="decimal" className="input w-28 text-right" value={raw}
                        onChange={(e) => setCount(m.id, e.target.value)} aria-label={`Counted ${m.name}`} />
                      <span className="w-10 text-left text-xs text-slate-500">{m.unit}</span>
                    </div>
                  </td>
                  {!blind && (
                    <td className={`num ${diff === null || diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {diff === null ? "" : diff === 0 ? "matches" : `${diff > 0 ? "+" : ""}${num(diff)}`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.error && <p className="error-box">{state.error}</p>}
      {invalid && <p className="error-box">Counted quantities must be 0 or more.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || counted.length === 0 || invalid}>
          {pending ? "Saving…" : `Save count (${counted.length} material${counted.length === 1 ? "" : "s"})`}
        </button>
        <span className="text-sm text-slate-500">Blank rows are left as they are. You can count in sections and save each one.</span>
      </div>
    </form>
  );
}
