"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions/pos";
import { SubmitButton, useFormAction } from "./client-ui";

/** Shown to an approver on a PO waiting for approval: approve & sign, or return with a note. */
export function ApprovalPanel({
  approve,
  returnPo,
  signature,
  printHref,
}: {
  approve: (fd: FormData) => Promise<void>;
  returnPo: (prev: FormState, fd: FormData) => Promise<FormState>;
  signature: string | null;
  printHref: string;
}) {
  const [returning, setReturning] = useState(false);
  const [state, onSubmit, pending] = useFormAction<FormState>(returnPo, {});
  return (
    <section className="card mb-6 border-violet-300 bg-violet-50/50 p-4">
      <h2 className="mb-1">Waiting for your approval</h2>
      <p className="mb-3 text-sm text-slate-600">
        Check the lines, suppliers and totals below{" "}
        (<a href={printHref} target="_blank" className="text-brand-700 underline">print preview</a>). Approving signs it with your e-signature and marks it as ordered.
      </p>
      {returning ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <label className="label" htmlFor="note">What needs to change?</label>
          <textarea id="note" name="note" rows={3} className="input bg-white" required maxLength={2000} placeholder="e.g. Use the 550W panels from One Point instead; quantity of rails should be 16." />
          {state.error && <p className="error-box">{state.error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-danger" disabled={pending}>{pending ? "Returning…" : "Return to preparer"}</button>
            <button type="button" className="btn" onClick={() => setReturning(false)}>Back</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {signature ? (
            <>
              <img src={signature} alt="Your e-signature" className="h-12 max-w-48 rounded border border-slate-200 bg-white object-contain p-1" />
              <form action={approve}>
                <SubmitButton pendingText="Approving…">Approve &amp; sign</SubmitButton>
              </form>
            </>
          ) : (
            <p className="text-sm text-amber-800">
              Add your e-signature in <a href="/account" className="underline">My account</a> before approving.
            </p>
          )}
          <button type="button" className="btn" onClick={() => setReturning(true)}>Return with a note…</button>
        </div>
      )}
    </section>
  );
}
