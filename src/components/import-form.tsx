"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ImportState } from "@/app/actions/master-csv";
import { useFormAction } from "./client-ui";

const MAX_BYTES = 900 * 1024;

export function ImportForm({
  action,
  listHref,
  noun,
  hasSupplierField,
}: {
  action: (prev: ImportState, fd: FormData) => Promise<ImportState>;
  listHref: string;
  noun: string;
  hasSupplierField: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction<ImportState>(action, {});
  const [sizeError, setSizeError] = useState("");
  const [addSuppliers, setAddSuppliers] = useState(false);
  const [createMissing, setCreateMissing] = useState(false);
  const checkRef = useRef<HTMLButtonElement>(null);

  // Ticks an option, then re-checks the file with it (after React has applied the tick).
  function fixAndRecheck(fix: () => void) {
    fix();
    setTimeout(() => checkRef.current?.click(), 0);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (file && file.size > MAX_BYTES) {
      e.preventDefault();
      setSizeError("That file is too big (limit 900 KB). Split it into smaller files.");
      return;
    }
    setSizeError("");
    onSubmit(e);
  }

  const s = state.summary;
  const changes = s ? s.created + s.updated + s.newSuppliers : 0;
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="file">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" required />
        </div>
        <button ref={checkRef} className="btn" name="intent" value="check" disabled={pending}>{pending ? "Working…" : "Check file"}</button>
        <button className="btn btn-primary" name="intent" value="import" disabled={pending}>Import</button>
        <div className="flex w-full flex-wrap gap-x-6 gap-y-1 text-sm">
          {hasSupplierField && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="addSuppliers" checked={addSuppliers} onChange={(e) => setAddSuppliers(e.target.checked)} />
              Add suppliers that aren’t in the list yet
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="createMissing" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            If an id isn’t found, add that row as a new {noun.replace(/s$/, "")}
          </label>
        </div>
      </form>

      {(sizeError || state.error) && <p className="error-box">{sizeError || state.error}</p>}

      {!sizeError && (state.missingSuppliers?.length || state.missingIds?.length) ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          {state.missingSuppliers && state.missingSuppliers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {state.missingSuppliers.length === 1 ? "This supplier isn’t" : `These ${state.missingSuppliers.length} suppliers aren’t`} in your list yet:{" "}
                <b>{state.missingSuppliers.join(", ")}</b>.
              </span>
              <button type="button" className="btn btn-sm" disabled={pending} onClick={() => fixAndRecheck(() => setAddSuppliers(true))}>
                Add {state.missingSuppliers.length === 1 ? "it" : "them"} as new suppliers
              </button>
            </div>
          )}
          {state.missingIds && state.missingIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {state.missingIds.length === 1 ? "1 row has an id" : `${state.missingIds.length} rows have ids`} that {state.missingIds.length === 1 ? "isn’t" : "aren’t"} in the list ({state.missingIds.slice(0, 10).join(", ")}{state.missingIds.length > 10 ? "…" : ""}).
              </span>
              <button type="button" className="btn btn-sm" disabled={pending} onClick={() => fixAndRecheck(() => setCreateMissing(true))}>
                Add {state.missingIds.length === 1 ? "it" : "them"} as new {noun}
              </button>
            </div>
          )}
          <p className="text-xs text-amber-900">This only re-checks the file — nothing is saved until you click Import.</p>
        </div>
      ) : null}

      {state.rowErrors && state.rowErrors.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-20">Row</th><th>Problem</th></tr></thead>
            <tbody>
              {state.rowErrors.map((r) => (
                <tr key={r.row}><td className="tabular-nums">{r.row}</td><td className="text-red-700">{r.message}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s && !sizeError && (
        <p className={state.applied ? "ok-box" : "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"}>
          {state.applied ? "Imported: " : changes ? "Ready to import: " : "Nothing to import: "}
          {s.created} new, {s.updated} updated, {s.unchanged} unchanged
          {s.newSuppliers > 0 && `, ${s.newSuppliers} new supplier${s.newSuppliers > 1 ? "s" : ""}`}.
          {!state.applied && changes > 0 && " Click Import to save these changes."}
          {state.applied && <> <Link href={listHref} className="underline">Back to {noun}</Link></>}
        </p>
      )}

      {s && !sizeError && state.rows && state.rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th className="w-20">Row</th><th className="w-24">Action</th><th>Name</th><th>Changes</th></tr></thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.row} className="align-top">
                  <td className="tabular-nums">{r.row}</td>
                  <td>{r.action === "create" ? <span className="text-emerald-700">New</span> : "Update"}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-slate-600">
                    {r.changes.length ? r.changes.map((c, i) => <div key={i}>{c}</div>) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.rows.length < s.created + s.updated && (
            <p className="px-4 py-2 text-xs text-slate-500">Showing the first {state.rows.length} of {s.created + s.updated} changes.</p>
          )}
        </div>
      )}
    </div>
  );
}
