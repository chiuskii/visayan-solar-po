"use client";

import Link from "next/link";
import type { FormState } from "@/app/actions/masters";
import { MASTERS, type MasterKey } from "@/lib/masters";
import { useFormAction } from "./client-ui";
import { FieldInput } from "./master-form";

/** One row per field: tick "Change" and set the value to apply it to every selected record. */
export function BulkEditForm({
  entity,
  count,
  action,
  suppliers,
}: {
  entity: MasterKey;
  count: number;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  suppliers: { id: number; name: string }[];
}) {
  const cfg = MASTERS[entity];
  const [state, onSubmit, pending] = useFormAction<FormState>(action, {});
  const fields = cfg.fields.filter((f) => f.name !== "name");

  // Typing in a field ticks its "Change" box.
  function onInput(e: React.FormEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement;
    if (!t.name || t.name.startsWith("change_")) return;
    const box = e.currentTarget.elements.namedItem(`change_${t.name}`) as HTMLInputElement | null;
    if (box) box.checked = true;
  }

  const noun = count === 1 ? cfg.singular.toLowerCase() : cfg.title.toLowerCase();
  return (
    <form onSubmit={onSubmit} onInput={onInput} onChange={onInput} className="card max-w-3xl space-y-4 p-5">
      <p className="text-sm text-slate-600">
        Tick each field you want to change. The value is applied to all {count} {noun}; unticked fields are left as they are.
      </p>
      <div className="divide-y divide-slate-100">
        {fields.map((f) => (
          <div key={f.name} className="grid items-start gap-2 py-3 sm:grid-cols-[180px_1fr]">
            <label className="flex items-center gap-2 pt-2 text-sm font-medium">
              <input type="checkbox" name={`change_${f.name}`} />
              {f.label}
            </label>
            <FieldInput field={f} suppliers={suppliers} required={false} />
          </div>
        ))}
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : `Apply to ${count} ${noun}`}</button>
        <Link href={`/${entity}`} className="btn">Cancel</Link>
      </div>
    </form>
  );
}
