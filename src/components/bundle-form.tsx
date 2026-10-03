"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { addSuppliersByName, type FormState } from "@/app/actions/bundles";
import { peso } from "@/lib/format";
import { parsePastedTable, toNumber } from "@/lib/paste-table";
import { useFormAction } from "./client-ui";
import { blankLine, isBlankLine, lineAmount, LineItemsTable, linesJson, newKey, r2, type Line, type MaterialOpt, type SupplierOpt } from "./line-items";

export type BundleFormValues = { name: string; description: string; items: Line[] };

export function BundleForm({
  action,
  initial,
  materials,
  suppliers: initialSuppliers,
  isEdit,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: BundleFormValues;
  materials: MaterialOpt[];
  suppliers: SupplierOpt[];
  isEdit: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const [lines, setLines] = useState<Line[]>(initial.items.length ? initial.items : [blankLine()]);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  // Supplier names from a paste that aren't in the Suppliers list yet, by line key.
  const [pendingSupplier, setPendingSupplier] = useState<Map<string, string>>(new Map());
  const [adding, startAdding] = useTransition();

  const total = useMemo(() => r2(lines.reduce((s, l) => s + lineAmount(l), 0)), [lines]);
  const unknownNames = [...new Set([...pendingSupplier.values()])];

  function importPaste() {
    const { rows, skipped } = parsePastedTable(paste);
    if (rows.length === 0) {
      setPasteNote("Couldn’t find any rows. Copy the table including its header row (ITEM DESCRIPTION, UNIT, UNIT PRICE, QTY, SUPPLIER).");
      return;
    }
    const byName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const matByName = new Map(materials.map((m) => [`${m.name}|${m.spec ?? ""}`.toLowerCase(), m]));
    const pending = new Map(pendingSupplier);
    let badNumbers = 0;
    const added: Line[] = rows.map((r) => {
      const qty = toNumber(r.quantity);
      const cost = toNumber(r.unitCost);
      if (Number.isNaN(qty) || Number.isNaN(cost)) badNumbers++;
      const mat = matByName.get(`${r.description}|${r.spec}`.toLowerCase());
      const line: Line = {
        key: newKey(),
        supplierId: byName.get(r.supplier.toLowerCase()) ?? mat?.defaultSupplierId ?? "",
        materialId: mat?.id ?? null,
        description: r.description,
        spec: r.spec,
        unit: r.unit || mat?.unit || "pcs",
        quantity: Number.isNaN(qty) ? "" : String(qty),
        unitCost: Number.isNaN(cost) ? "" : String(cost),
      };
      if (line.supplierId === "" && r.supplier) pending.set(line.key, r.supplier);
      return line;
    });
    setLines((ls) => [...ls.filter((l) => !isBlankLine(l)), ...added]);
    setPendingSupplier(pending);
    setPaste("");
    setPasteNote(
      `Added ${added.length} lines.` +
        (skipped ? ` Skipped ${skipped} row${skipped > 1 ? "s" : ""} with no description.` : "") +
        (badNumbers ? ` ${badNumbers} row${badNumbers > 1 ? "s have" : " has"} a price or quantity to fix.` : ""),
    );
  }

  function addMissingSuppliers() {
    startAdding(async () => {
      const created = await addSuppliersByName(unknownNames);
      const ids = new Map(created.map((s) => [s.name.trim().toLowerCase(), s.id]));
      setSuppliers((cur) => {
        const known = new Set(cur.map((s) => s.id));
        return [...cur, ...created.filter((s) => !known.has(s.id))].sort((a, b) => a.name.localeCompare(b.name));
      });
      setLines((ls) =>
        ls.map((l) => {
          const name = pendingSupplier.get(l.key);
          return name && l.supplierId === "" ? { ...l, supplierId: ids.get(name.trim().toLowerCase()) ?? "" } : l;
        }),
      );
      setPendingSupplier(new Map());
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="items" value={linesJson(lines)} />

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Bundle name *</label>
          <input id="name" name="name" className="input" defaultValue={initial.name} required placeholder="e.g. 8kW Hybrid System" />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <input id="description" name="description" className="input" defaultValue={initial.description} placeholder="e.g. Deye 8kW + mounting + BOS" />
        </div>
      </section>

      <section className="card space-y-2 p-5">
        <label className="label" htmlFor="paste">Paste from spreadsheet</label>
        <p className="text-xs text-slate-500">
          Copy the rows (with the header row) from Excel or Google Sheets and paste them here. Columns are matched by their headings:
          description, unit, unit price, qty, supplier. The amount column is ignored.
        </p>
        <textarea
          id="paste"
          rows={4}
          className="input font-mono text-xs"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"ITEM DESCRIPTION\tUNIT\tUNIT PRICE\tQTY\tAMOUNT\tSUPPLIER\nDeye Inverter 8KW\tunit\t₱58,000.00\t1\t₱58,000.00\tOne Point"}
        />
        <button type="button" className="btn btn-sm" onClick={importPaste} disabled={!paste.trim()}>Add pasted rows</button>
        {pasteNote && <p className="text-sm text-slate-700">{pasteNote}</p>}
        {unknownNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            <span>
              {unknownNames.length === 1 ? "This supplier isn’t" : `These ${unknownNames.length} suppliers aren’t`} in your list yet:{" "}
              <b>{unknownNames.join(", ")}</b>.
            </span>
            <button type="button" className="btn btn-sm" onClick={addMissingSuppliers} disabled={adding}>
              {adding ? "Adding…" : unknownNames.length === 1 ? "Add as supplier" : "Add them as suppliers"}
            </button>
          </div>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2>Materials in this bundle</h2>
          <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blankLine(ls.at(-1)?.supplierId ?? "")])}>
            + Add line
          </button>
        </div>
        <LineItemsTable lines={lines} setLines={setLines} materials={materials} suppliers={suppliers} supplierRequired={false} />
        <div className="flex justify-end border-t border-slate-200 px-4 py-3 text-sm font-semibold">
          <span className="mr-6 text-slate-500">Bundle total ({lines.filter((l) => !isBlankLine(l)).length} lines)</span>
          <span className="tabular-nums">{peso(total)}</span>
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="addToMaterials" defaultChecked />
        Also add new items to the Materials list (matched by name + spec, so nothing is added twice)
      </label>

      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save bundle" : "Create bundle"}</button>
        <Link href="/bundles" className="btn">Cancel</Link>
      </div>
    </form>
  );
}
