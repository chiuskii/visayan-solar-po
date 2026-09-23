"use client";

import Link from "next/link";
import { saveMaster, type FormState } from "@/app/actions/masters";
import { MASTERS, type FieldDef, type MasterKey } from "@/lib/masters";
import { useFormAction } from "./client-ui";

export function MasterForm({
  entity,
  id,
  initial,
  suppliers = [],
}: {
  entity: MasterKey;
  id: number | null;
  initial?: Record<string, unknown>;
  suppliers?: { id: number; name: string }[];
}) {
  const cfg = MASTERS[entity];
  const [state, onSubmit, pending] = useFormAction<FormState>(saveMaster.bind(null, entity, id), {});
  return (
    <form onSubmit={onSubmit} className="card max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {cfg.fields.map((f) => {
          return (
            <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor={f.name}>
                {f.label}
                {f.required && <span className="text-red-600"> *</span>}
              </label>
              <FieldInput field={f} value={initial?.[f.name]} suppliers={suppliers} />
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

/** The input for one master field (text, textarea, number, or supplier dropdown). */
export function FieldInput({
  field: f,
  value,
  suppliers,
  required = f.required,
}: {
  field: FieldDef;
  value?: unknown;
  suppliers: { id: number; name: string }[];
  required?: boolean;
}) {
  const common = {
    id: f.name,
    name: f.name,
    required,
    placeholder: f.placeholder,
    defaultValue: value == null ? "" : String(value),
    className: "input",
  };
  if (f.type === "textarea") return <textarea {...common} rows={3} />;
  if (f.type === "supplier") {
    return (
      <select {...common}>
        <option value="">— None —</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  }
  return <input {...common} type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} min={f.type === "number" ? 0 : undefined} />;
}
