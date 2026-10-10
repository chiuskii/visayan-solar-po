// Links that open a new Gmail message, filled in, in the given Gmail account. Sending stays with the
// person: the message goes out from their own mailbox when they click Send.

export function gmailComposeUrl({ from, to, subject, body }: { from?: string; to?: string | string[]; subject?: string; body?: string }) {
  const list = Array.isArray(to) ? to.join(",") : (to ?? "");
  const p = new URLSearchParams({ view: "cm", fs: "1" });
  if (from?.trim()) p.set("authuser", from.trim()); // which signed-in Google account composes it
  if (list.trim()) p.set("to", list.trim());
  if (subject?.trim()) p.set("su", subject.trim());
  if (body?.trim()) p.set("body", body.trim());
  return `https://mail.google.com/mail/?${p}`;
}
