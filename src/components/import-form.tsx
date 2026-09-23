"use client";

import Link from "next/link";
import { useState } from "react";
import type { ImportState } from "@/app/actions/master-csv";
import { useFormAction } from "./client-ui";

const MAX_BYTES = 900 * 1024;

export function ImportForm({
  action,
  listHref,
  noun,
}: {
  action: (prev: ImportState, fd: FormData) => Promise<ImportState>;
  listHref: string;
  noun: string;
}) {
  const [state, onSubmit, pending] = useFormAction<ImportState>(action, {});
  const [sizeError, setSizeError] = useState("");

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
  const changes = s ? s.created + s.updated : 0;
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="file">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" required />
        </div>
        <button className="btn" name="intent" value="check" disabled={pending}>{pending ? "Working…" : "Check file"}</button>
        <button className="btn btn-primary" name="intent" value="import" disabled={pending}>Import</button>
      </form>

      {(sizeError || state.error) && <p className="error-box">{sizeError || state.error}</p>}

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
          {s.created} new, {s.updated} updated, {s.unchanged} unchanged.
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
          {state.rows.length < changes && <p className="px-4 py-2 text-xs text-slate-500">Showing the first {state.rows.length} of {changes} changes.</p>}
        </div>
      )}
    </div>
  );
}
