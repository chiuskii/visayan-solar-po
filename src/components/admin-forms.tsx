"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { changeMyPassword, saveSettings, saveUser, type FormState } from "@/app/actions/admin";
import { useFormAction } from "./client-ui";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="error-box">{state.error}</p>;
  if (state.ok) return <p className="ok-box">{state.ok}</p>;
  return null;
}

export function UserForm({ id, initial }: { id: number | null; initial?: { name: string; email: string; role: string; active: boolean } }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveUser.bind(null, id), {});
  return (
    <form onSubmit={onSubmit} className="card max-w-xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Full name *</label>
          <input className="input" id="name" name="name" defaultValue={initial?.name} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="email">Email (used to sign in) *</label>
          <input className="input" id="email" name="email" type="email" defaultValue={initial?.email} required />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select className="input" id="role" name="role" defaultValue={initial?.role ?? "STAFF"}>
            <option value="STAFF">Staff — POs, deliveries, lists</option>
            <option value="ADMIN">Admin — also users & settings</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} /> Account active
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="password">{id ? "New password (leave blank to keep current)" : "Password *"}</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required={!id} />
        </div>
      </div>
      <Msg state={state} />
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : id ? "Save changes" : "Add user"}</button>
        <Link className="btn" href="/users">Cancel</Link>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, onSubmit, pending] = useFormAction<FormState>(changeMyPassword, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="card max-w-md space-y-4 p-5">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next">New password (8+ characters)</label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Msg state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
    </form>
  );
}

type Settings = Record<string, string | null>;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveSettings, {});
  const field = (name: string, label: string, opts: { area?: boolean; wide?: boolean; hint?: string } = {}) => (
    <div className={opts.wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={name}>{label}</label>
      {opts.area ? (
        <textarea className="input" id={name} name={name} rows={3} defaultValue={initial[name] ?? ""} />
      ) : (
        <input className="input" id={name} name={name} defaultValue={initial[name] ?? ""} />
      )}
      {opts.hint && <p className="mt-1 text-xs text-slate-500">{opts.hint}</p>}
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="card max-w-3xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("companyName", "Company name *", { wide: true })}
        {field("address", "Company address", { area: true, wide: true })}
        {field("phone", "Phone")}
        {field("email", "Email")}
        {field("tin", "TIN")}
        {field("poPrefix", "PO number prefix", { hint: "e.g. VS-PO gives VS-PO-2026-0001" })}
        {field("defaultTerms", "Default payment terms")}
        <div />
        {field("approverName", "Approver name (printed on PO)")}
        {field("approverTitle", "Approver title")}
        {field("poFooter", "PO footer note", { area: true, wide: true })}
      </div>
      <Msg state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
