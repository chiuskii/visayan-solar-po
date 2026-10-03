"use client";

import { peso } from "@/lib/format";

// Shared editor for material lines — used by the PO form and the bundle form.

export type SupplierOpt = { id: number; name: string };
export type MaterialOpt = { id: number; name: string; spec: string | null; unit: string; defaultCost: number; defaultSupplierId: number | null };

export type Line = {
  key: string;
  id?: number;
  supplierId: number | "";
  materialId: number | null;
  description: string;
  spec: string;
  unit: string;
  quantity: string;
  unitCost: string;
  /** Quantity already delivered (PO edit only); the line can't be removed or reduced below it. */
  received?: number;
};

let keySeq = 0;
export const newKey = () => `n${++keySeq}`;
export const blankLine = (supplierId: number | "" = ""): Line => ({
  key: newKey(),
  supplierId,
  materialId: null,
  description: "",
  spec: "",
  unit: "pcs",
  quantity: "",
  unitCost: "",
});

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const lineAmount = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unitCost) || 0);
export const isBlankLine = (l: Line) => !l.description.trim() && !l.quantity && !l.unitCost;

/** The lines as JSON for the server action (blank rows dropped). */
export function linesJson(lines: Line[]) {
  return JSON.stringify(
    lines
      .filter((l) => !isBlankLine(l))
      .map((l) => ({
        id: l.id,
        supplierId: l.supplierId === "" ? null : l.supplierId,
        materialId: l.materialId,
        description: l.description,
        spec: l.spec,
        unit: l.unit,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost || 0),
      })),
  );
}

export function LineItemsTable({
  lines,
  setLines,
  materials,
  suppliers,
  supplierRequired = true,
}: {
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  materials: MaterialOpt[];
  suppliers: SupplierOpt[];
  supplierRequired?: boolean;
}) {
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function pickMaterial(key: string, value: string) {
    if (!value) return update(key, { materialId: null });
    const m = materials.find((x) => x.id === Number(value));
    if (!m) return;
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              materialId: m.id,
              description: m.name,
              spec: m.spec ?? "",
              unit: m.unit,
              unitCost: m.defaultCost ? String(m.defaultCost) : "",
              supplierId: m.defaultSupplierId ?? l.supplierId,
            }
          : l,
      ),
    );
  }

  return (
    <table className="table min-w-[1080px]">
      <thead>
        <tr>
          <th className="w-56">Pick from list</th>
          <th className="w-48">Supplier{supplierRequired ? " *" : ""}</th>
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
              <td>
                <select
                  className="input"
                  value={l.supplierId}
                  onChange={(e) => update(l.key, { supplierId: e.target.value ? Number(e.target.value) : "" })}
                  aria-label="Supplier"
                >
                  <option value="">Choose…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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
              <td className="num">{peso(lineAmount(l))}</td>
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
  );
}
