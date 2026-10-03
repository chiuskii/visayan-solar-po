// Reads a table pasted from Excel / Google Sheets into material lines.
import { parseCsv } from "./csv";

export type PastedCol = "description" | "spec" | "unit" | "unitCost" | "quantity" | "supplier";
// Header text → column. "unit" must match exactly so "Unit price" isn't read as the unit.
const HEADER_RULES: [PastedCol, RegExp][] = [
  ["unitCost", /price|cost|rate/i],
  ["quantity", /^(qty|quantity|qty\.?|pcs)$/i],
  ["unit", /^(unit|units|uom)$/i],
  ["supplier", /supplier|vendor/i],
  ["spec", /spec|brand/i],
  ["description", /desc|item|material|particular/i],
];
// Column order when the pasted table has no header row: ITEM DESCRIPTION, UNIT, UNIT PRICE, QTY, AMOUNT, SUPPLIER.
const DEFAULT_ORDER: (PastedCol | null)[] = ["description", "unit", "unitCost", "quantity", null, "supplier"];

/** "₱58,000.00" → 58000, "1." → 1; NaN when it isn't a number. */
export const toNumber = (s: string) => {
  const n = Number(s.replace(/[₱,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/** Reads rows copied from Excel / Google Sheets (tab-separated) or a CSV. */
export function parsePastedTable(text: string) {
  const rows = text.includes("\t")
    ? text.replace(/\r/g, "").split("\n").map((l) => l.split("\t"))
    : parseCsv(text);
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  if (nonEmpty.length === 0) return { rows: [] as Record<PastedCol, string>[], skipped: 0 };

  let order: (PastedCol | null)[] = DEFAULT_ORDER;
  let body = nonEmpty;
  const first = nonEmpty[0].map((c) => c.trim());
  const headerOrder = first.map((h) => HEADER_RULES.find(([, re]) => re.test(h))?.[0] ?? null);
  if (headerOrder.includes("description")) {
    order = headerOrder;
    body = nonEmpty.slice(1);
  }
  let skipped = 0;
  const out: Record<PastedCol, string>[] = [];
  for (const cells of body) {
    const rec = { description: "", spec: "", unit: "", unitCost: "", quantity: "", supplier: "" } as Record<PastedCol, string>;
    order.forEach((col, i) => {
      if (col && !rec[col]) rec[col] = (cells[i] ?? "").trim();
    });
    if (!rec.description) {
      skipped++;
      continue;
    }
    out.push(rec);
  }
  return { rows: out, skipped };
}
