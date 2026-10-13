"use client";

import Link from "next/link";
import { useState } from "react";
import { createApiKey, updateApiKey, type ApiKeyFormState } from "@/app/actions/api-keys";
import type { ApiAccessLevel, ApiFeature } from "@/db/types";
import { useFormAction } from "./client-ui";

export type FeatureOption = { feature: ApiFeature; label: string; read: string; write?: string };

/** Shows a newly created key once, with a copy button. */
function NewKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // http (no Clipboard API): the field is selected so Ctrl/Cmd+C works
      (document.getElementById("new-key") as HTMLInputElement | null)?.select();
    }
  }
  return (
    <div className="card max-w-3xl space-y-3 border-emerald-300 bg-emerald-50 p-5">
      <p className="font-medium text-emerald-900">API key created. Copy it now — it won’t be shown again.</p>
      <div className="flex gap-2">
        <input id="new-key" className="input font-mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn-primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <p className="text-sm text-slate-600">
        Send it in the <code>Authorization: Bearer &lt;key&gt;</code> header. Store it like a password; if it leaks, disable or delete it here.
      </p>
      <Link href="/settings/api-keys" className="btn">Done</Link>
    </div>
  );
}

export function ApiKeyForm({
  id,
  features,
  initial,
}: {
  id: number | null;
  features: FeatureOption[];
  initial?: { name: string; notes: string | null; expiresAt: string | null; active: boolean; permissions: Partial<Record<ApiFeature, ApiAccessLevel>> };
}) {
  const [state, onSubmit, pending] = useFormAction<ApiKeyFormState>(id ? updateApiKey.bind(null, id) : createApiKey, {});
  if (state.key) return <NewKey value={state.key} />;
  return (
    <form onSubmit={onSubmit} className="card max-w-3xl space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name *</label>
          <input className="input" id="name" name="name" defaultValue={initial?.name} maxLength={120} required placeholder="e.g. Accounting system" />
        </div>
        <div>
          <label className="label" htmlFor="expiresAt">Expires on</label>
          <input className="input" id="expiresAt" name="expiresAt" type="date" defaultValue={initial?.expiresAt ?? ""} />
          <p className="mt-1 text-xs text-slate-500">Leave blank for no expiry. The key stops working after this day.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea className="input" id="notes" name="notes" rows={2} defaultValue={initial?.notes ?? ""} placeholder="Who uses it and what for" />
        </div>
        {id && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} /> Key active
          </label>
        )}
      </div>

      <div>
        <div className="label">Access by feature</div>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="table">
            <thead>
              <tr><th>Feature</th><th className="text-center">None</th><th className="text-center">Read</th><th className="text-center">Write</th><th>Allows</th></tr>
            </thead>
            <tbody>
              {features.map((f) => {
                const current = initial?.permissions[f.feature] ?? "";
                return (
                  <tr key={f.feature}>
                    <td className="font-medium whitespace-nowrap">{f.label}</td>
                    {(["", "READ", "WRITE"] as const).map((level) => (
                      <td key={level} className="text-center">
                        {level === "WRITE" && !f.write ? (
                          <span className="text-slate-300" title="The API can only read this feature">—</span>
                        ) : (
                          <input type="radio" name={`perm_${f.feature}`} value={level} defaultChecked={current === level}
                            aria-label={`${f.label}: ${level || "None"}`} />
                        )}
                      </td>
                    ))}
                    <td className="text-sm text-slate-600">
                      <div><b>Read:</b> {f.read}</div>
                      {f.write && <div><b>Write:</b> {f.write} (includes read)</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save changes" : "Create key"}</button>
        <Link href="/settings/api-keys" className="btn">Cancel</Link>
      </div>
    </form>
  );
}
