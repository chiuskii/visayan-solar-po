"use client";

import { useState, useTransition } from "react";
import { draftStockEmail, sendStockEmail, type SendState } from "@/app/actions/report";
import { useFormAction } from "./client-ui";

export function ReportForm({ defaultTo, canSend }: { defaultTo: string; canSend: boolean }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [draftError, setDraftError] = useState("");
  const [drafting, startDraft] = useTransition();
  const [state, onSubmit, sending] = useFormAction<SendState>(sendStockEmail, {});

  function generate() {
    setDraftError("");
    startDraft(async () => {
      const d = await draftStockEmail();
      if (d.error) return setDraftError(d.error);
      setSubject(d.subject ?? "");
      setBody(d.body ?? "");
      setNote(d.ai ? "Written by AI from the figures below — check it, edit if needed, then send." : (d.note ?? ""));
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={generate} disabled={drafting}>
          {drafting ? "Writing…" : body ? "Regenerate" : "Generate email"}
        </button>
        {note && <span className="text-sm text-slate-600">{note}</span>}
      </div>
      {draftError && <p className="error-box">{draftError}</p>}
      <div>
        <label className="label" htmlFor="to">To *</label>
        <input id="to" name="to" className="input" defaultValue={defaultTo} placeholder="purchasing@example.com, manager@example.com" required />
      </div>
      <div>
        <label className="label" htmlFor="subject">Subject *</label>
        <input id="subject" name="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
      </div>
      <div>
        <label className="label" htmlFor="body">Message *</label>
        <textarea id="body" name="body" rows={12} className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} required
          placeholder="Click Generate email to draft the update from current stock." />
        <p className="mt-1 text-xs text-slate-500">The “Needs attention” table below is added to the email automatically, with the figures as of sending.</p>
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      {state.ok && <p className="ok-box">{state.ok}</p>}
      <button className="btn btn-primary" disabled={sending || !canSend || !body}>{sending ? "Sending…" : "Send email"}</button>
      {!canSend && <p className="text-sm text-amber-800">Email isn’t set up yet — see “Setup” on the right.</p>}
    </form>
  );
}
