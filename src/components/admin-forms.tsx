"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { changeMyPassword, saveMySignature, saveSettings, saveUser, setUserPassword, type FormState } from "@/app/actions/admin";
import type { CompanySettings } from "@/db/types";
import { useFormAction } from "./client-ui";
import { SignaturePad } from "./signature-pad";

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p className="error-box">{state.error}</p>;
  if (state.ok) return <p className="ok-box">{state.ok}</p>;
  return null;
}

export function UserForm({
  id,
  initial,
}: {
  id: number | null;
  initial?: { name: string; designation: string | null; email: string; role: string; canApprove: boolean; active: boolean };
}) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveUser.bind(null, id), {});
  return (
    <form onSubmit={onSubmit} className="card max-w-xl space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Full name *</label>
          <input className="input" id="name" name="name" defaultValue={initial?.name} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="designation">Designation</label>
          <input className="input" id="designation" name="designation" defaultValue={initial?.designation ?? ""} maxLength={120} placeholder="e.g. Purchasing Officer, General Manager" />
          <p className="mt-1 text-xs text-slate-500">Printed under the name on POs (Prepared by / Approved by).</p>
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
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="canApprove" defaultChecked={initial?.canApprove ?? false} className="mt-0.5" />
          <span>
            <b>Approver</b> — can review and approve POs submitted by others, signing them with their e-signature.
          </span>
        </label>
        {!id && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="password">Password * (8+ characters)</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
        )}
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

type Settings = Omit<CompanySettings, "id" | "updatedAt">;

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveSettings, {});
  type TextKey = Exclude<keyof Settings, "showSignatures" | "requireApproval">;
  const field = (name: TextKey, label: string, opts: { area?: boolean; wide?: boolean; hint?: string } = {}) => (
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
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="requireApproval" defaultChecked={initial.requireApproval} className="mt-0.5" />
          <span>
            <b>Require approval before a PO is ordered.</b> POs are submitted to an approver (set under Users), who reviews and signs them.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="showSignatures" defaultChecked={initial.showSignatures} className="mt-0.5" />
          <span>Show e-signatures on printed POs by default (can still be switched off on each print)</span>
        </label>
        {field("poFooter", "PO footer note", { area: true, wide: true })}
        {field("reportRecipients", "Stock report recipients", {
          wide: true,
          hint: "Email addresses that receive the stock report (Inventory → Stock report), separated by commas.",
        })}
      </div>
      <Msg state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

export function SignatureForm({ initial }: { initial: string | null }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(saveMySignature, {});
  return (
    <form onSubmit={onSubmit} className="card max-w-md space-y-4 p-5">
      <SignaturePad name="signature" initial={initial} label="My e-signature" />
      <p className="text-xs text-slate-500">Printed above “Prepared by” on purchase orders you create.</p>
      <Msg state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save signature"}</button>
    </form>
  );
}

/** Admin sets a new password for another user. */
export function SetPasswordForm({ id, name }: { id: number; name: string }) {
  const [state, onSubmit, pending] = useFormAction<FormState>(setUserPassword.bind(null, id), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} id="password" className="card max-w-xl scroll-mt-6 space-y-4 p-5">
      <div>
        <h2>Change password</h2>
        <p className="text-sm text-slate-500">Sets a new password for {name}. They can change it later under My account.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="next">New password (8+ characters)</label>
          <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      <Msg state={state} />
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}
