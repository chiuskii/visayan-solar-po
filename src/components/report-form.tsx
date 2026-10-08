"use client";

import { useEffect, useState, useTransition } from "react";
import { draftStockEmail, type DraftState } from "@/app/actions/report";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DEFAULT_ACCOUNT = "inventory@visayansolar.com";
const ACCOUNT_KEY = "stockReport.gmailAccount";

/** The written message as HTML paragraphs, followed by the exact figures table. */
function emailHtml(body: string, tableHtml: string) {
  const paragraphs = esc(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a">${paragraphs}${tableHtml}</div>`;
}

/**
 * Copies formatted HTML (with a plain-text alternative) so pasting into Gmail keeps the table.
 * The Clipboard API needs https; on plain http (e.g. the NAS by IP) it falls back to copying a
 * selected, rendered copy, which keeps the formatting too.
 */
async function copyRich(html: string, text: string) {
  if (window.isSecureContext && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
      ]);
      return true;
    } catch {
      // fall through to the selection copy
    }
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  Object.assign(div.style, { position: "fixed", left: "-10000px", top: "0" });
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("copy");
  sel?.removeAllRanges();
  div.remove();
  return ok;
}

async function copyText(text: string) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  Object.assign(ta.style, { position: "fixed", left: "-10000px", top: "0" });
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

export function ReportForm({ defaultTo }: { defaultTo: string }) {
  const [draft, setDraft] = useState<DraftState>({});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState(defaultTo);
  const [account, setAccount] = useState(DEFAULT_ACCOUNT);
  const [copied, setCopied] = useState("");
  const [drafting, startDraft] = useTransition();

  // Remember which Gmail account to compose from, per browser.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCOUNT_KEY);
      if (saved) setAccount(saved);
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  function saveAccount(v: string) {
    setAccount(v);
    try {
      localStorage.setItem(ACCOUNT_KEY, v);
    } catch {
      // ignore
    }
  }

  function generate() {
    setCopied("");
    startDraft(async () => {
      const d = await draftStockEmail();
      setDraft(d);
      if (!d.error) {
        setSubject(d.subject ?? "");
        setBody(d.body ?? "");
      }
    });
  }

  const ready = Boolean(body && draft.tableHtml);
  const html = ready ? emailHtml(body, draft.tableHtml!) : "";
  const text = ready ? `${body}\n\n${draft.tableText}` : "";
  const flash = (msg: string) => {
    setCopied(msg);
    setTimeout(() => setCopied((c) => (c === msg ? "" : c)), 4000);
  };
  const gmailUrl =
    "https://mail.google.com/mail/?view=cm&fs=1" +
    (account.trim() ? `&authuser=${encodeURIComponent(account.trim())}` : "") +
    (to.trim() ? `&to=${encodeURIComponent(to.trim())}` : "") +
    (subject.trim() ? `&su=${encodeURIComponent(subject.trim())}` : "");

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={generate} disabled={drafting}>
          {drafting ? "Writing…" : body ? "Regenerate" : "Generate email"}
        </button>
        {draft.ai && <span className="text-sm text-slate-600">Written by AI from the figures below — check it and edit if needed.</span>}
        {!draft.ai && draft.note && <span className="text-sm text-slate-600">{draft.note}</span>}
      </div>
      {draft.error && <p className="error-box">{draft.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="purchasing@visayansolar.com" />
        </div>
        <div>
          <label className="label" htmlFor="account">Send from Gmail account</label>
          <input id="account" className="input" value={account} onChange={(e) => saveAccount(e.target.value)} placeholder={DEFAULT_ACCOUNT} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="subject">Subject</label>
        <input id="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label className="label" htmlFor="body">Message</label>
        <textarea id="body" rows={10} className="input" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Click Generate email to draft the update from current stock." />
        <p className="mt-1 text-xs text-slate-500">“Copy email” adds the Needs attention table under your message.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={!ready}
          onClick={async () => flash((await copyRich(html, text)) ? "Email copied — paste it into the Gmail message (Ctrl/Cmd+V)." : "Couldn’t copy — select the preview below and copy it.")}>
          Copy email
        </button>
        <a href={ready ? gmailUrl : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!ready}
          className={`btn ${ready ? "" : "pointer-events-none opacity-50"}`}>
          Open Gmail
        </a>
        <button type="button" className="btn" disabled={!subject}
          onClick={async () => flash((await copyText(subject)) ? "Subject copied." : "Couldn’t copy the subject.")}>
          Copy subject
        </button>
        <button type="button" className="btn" disabled={!ready}
          onClick={async () => flash((await copyText(text)) ? "Plain-text email copied." : "Couldn’t copy.")}>
          Copy as plain text
        </button>
        {copied && <span className="text-sm text-emerald-700">{copied}</span>}
      </div>
      <p className="text-xs text-slate-500">
        Steps: <b>Copy email</b> → <b>Open Gmail</b> (opens a new message as {account || "your account"}, with To and Subject filled in) → paste into the
        message → Send.
      </p>

      {ready && (
        <div>
          <div className="label">Preview</div>
          {/* Message text is escaped in emailHtml; the table comes from the server with its values escaped. */}
          <div className="max-h-[480px] overflow-auto rounded-md border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
