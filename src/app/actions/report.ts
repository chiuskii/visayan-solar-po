"use server";

import { requireUser } from "@/lib/auth";
import { factsText, gatherStockReport, reportTableHtml, writeStockEmail } from "@/lib/stock-report";

export type DraftState = {
  subject?: string;
  body?: string;
  ai?: boolean;
  note?: string;
  /** Exact figures to paste under the message: formatted (HTML) and plain text. */
  tableHtml?: string;
  tableText?: string;
  error?: string;
};

/** Drafts the stock update email from current stock (AI-written when an API key is set), ready to copy into Gmail. */
export async function draftStockEmail(): Promise<DraftState> {
  await requireUser();
  try {
    const data = await gatherStockReport();
    const email = await writeStockEmail(data);
    return { ...email, tableHtml: reportTableHtml(data), tableText: factsText(data) };
  } catch (e) {
    console.error("Stock report draft failed:", e);
    return { error: "Couldn’t prepare the report. Please try again." };
  }
}
