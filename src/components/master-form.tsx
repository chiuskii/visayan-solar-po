"use client";

import Link from "next/link";
import { saveMaster, type FormState } from "@/app/actions/masters";
import { MASTERS, type MasterKey } from "@/lib/masters";
import { useFormAction } from "./client-ui";

export function MasterForm({
  entity,
  id,
  initial,
}: {
  entity: MasterKey;
  id: number | null;
  initial?: Record<string, unknown>;
}) {
  const cfg = MASTERS[entity];
  const [state, onSubmit, pending] = useFormAction<FormState>(saveMaster.bind(null, entity, id), {});
  return (
    <form onSubmit={onSubmit} className="card max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {cfg.fields.map((f) => {
          const value = initial?.[f.name];
          const common = {
            id: f.name,
            name: f.name,
            required: f.required,
            placeholder: f.placeholder,
            defaultValue: value == null ? "" : String(value),
            className: "input",
          };
          return (
            <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor={f.name}>
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea {...common} rows={3} />
              ) : (
                <input {...common} type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} min={f.type === "number" ? 0 : undefined} />
              )}
            </div>
          );
        })}
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save changes" : `Add ${cfg.singular.toLowerCase()}`}</button>
        <Link href={`/${entity}`} className="btn">Cancel</Link>
      </div>
    </form>
  );
}
