"use server";

import { requireUser } from "@/lib/auth";
import { parseEmailList } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";
import { factsText, gatherStockReport, reportHtml, writeStockEmail } from "@/lib/stock-report";

export type DraftState = { subject?: string; body?: string; ai?: boolean; note?: string; error?: string };
export type SendState = { ok?: string; error?: string };

/** Drafts the stock update email from current stock (AI-written when an API key is set). */
export async function draftStockEmail(): Promise<DraftState> {
  await requireUser();
  try {
    const data = await gatherStockReport();
    return await writeStockEmail(data);
  } catch (e) {
    console.error("Stock report draft failed:", e);
    return { error: "Couldn’t prepare the report. Please try again." };
  }
}

/** Sends the (possibly edited) email, with the exact stock figures appended. */
export async function sendStockEmail(_prev: SendState, formData: FormData): Promise<SendState> {
  await requireUser();
  const { emails, invalid } = parseEmailList(String(formData.get("to") ?? ""));
  if (invalid.length) return { error: `Not a valid email address: ${invalid.join(", ")}` };
  if (emails.length === 0) return { error: "Add at least one recipient." };
  if (emails.length > 20) return { error: "Send to at most 20 addresses at a time." };
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 10_000);
  if (!subject || !body) return { error: "Write a subject and a message, or click Generate." };

  // Figures are re-read at send time, so the table is current even if the draft is older.
  const data = await gatherStockReport();
  try {
    await sendMail({ to: emails, subject, text: `${body}\n\n${factsText(data)}`, html: reportHtml(body, data) });
  } catch (e) {
    console.error("Stock report email failed:", e);
    return { error: e instanceof Error && e.message.startsWith("Email isn’t set up") ? e.message : "The email couldn’t be sent. Check the SMTP settings in .env." };
  }
  return { ok: `Sent to ${emails.join(", ")}.` };
}
