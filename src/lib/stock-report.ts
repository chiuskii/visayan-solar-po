import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { query } from "@/db";
import { fmtDate, num, peso, todayPH } from "./format";
import { listStock } from "./inventory";
import { getSettings } from "./po";

export type ReportItem = {
  id: number;
  name: string;
  spec: string | null;
  unit: string;
  onHand: number;
  reorderLevel: number;
  /** Ordered on open warehouse POs but not received yet. */
  onOrder: number;
  /** Assigned to clients in the last 30 days. */
  used30d: number;
  status: "out" | "low" | "ok";
  /** Suggested quantity to order: back up to twice the reorder level, minus stock and what's on order. */
  suggestedOrder: number;
  supplier: string | null;
  lastCost: number | null;
};

export type StockReportData = {
  date: string;
  companyName: string;
  totals: { materials: number; inStock: number; stockValue: number; low: number; out: number; toReorder: number };
  attention: ReportItem[];
  topUsed: ReportItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Gathers the figures for the report. Every number in the email comes from here. */
export async function gatherStockReport(): Promise<StockReportData> {
  const [stock, settings, onOrderRows, usedRows, supplierRows] = await Promise.all([
    listStock(),
    getSettings(),
    query<{ materialId: number; qty: number }>(
      `SELECT pi.material_id AS materialId,
              SUM(GREATEST(pi.quantity - COALESCE((SELECT SUM(di.quantity) FROM delivery_items di WHERE di.po_item_id = pi.id), 0), 0)) AS qty
       FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
       WHERE po.to_warehouse = 1 AND po.status IN ('PENDING', 'ORDERED', 'PARTIAL') AND pi.material_id IS NOT NULL
       GROUP BY pi.material_id`,
    ),
    query<{ materialId: number; qty: number }>(
      `SELECT material_id AS materialId, -SUM(quantity) AS qty FROM stock_movements
       WHERE type = 'ISSUE' AND movement_date >= CURDATE() - INTERVAL 30 DAY GROUP BY material_id`,
    ),
    // Preferred supplier: the material's default, else the supplier on its latest PO line; plus that line's price.
    query<{ materialId: number; supplier: string | null; lastCost: number | null }>(
      `SELECT m.id AS materialId,
              COALESCE(ds.name, (SELECT s.name FROM po_items pi JOIN suppliers s ON s.id = pi.supplier_id
                                 WHERE pi.material_id = m.id ORDER BY pi.id DESC LIMIT 1)) AS supplier,
              (SELECT pi.unit_cost FROM po_items pi WHERE pi.material_id = m.id ORDER BY pi.id DESC LIMIT 1) AS lastCost
       FROM materials m LEFT JOIN suppliers ds ON ds.id = m.default_supplier_id`,
    ),
  ]);
  const onOrder = new Map(onOrderRows.map((r) => [r.materialId, Number(r.qty)]));
  const used = new Map(usedRows.map((r) => [r.materialId, Number(r.qty)]));
  const sup = new Map(supplierRows.map((r) => [r.materialId, r]));

  const items: ReportItem[] = stock.map((s) => {
    const status = s.onHand <= 0 && (s.reorderLevel > 0 || s.lastMovement) ? "out" : s.reorderLevel > 0 && s.onHand <= s.reorderLevel ? "low" : "ok";
    const incoming = onOrder.get(s.id) ?? 0;
    const target = s.reorderLevel * 2;
    const suggestedOrder = status === "ok" ? 0 : Math.max(0, Math.ceil(target - s.onHand - incoming));
    return {
      id: s.id,
      name: s.name,
      spec: s.spec,
      unit: s.unit,
      onHand: s.onHand,
      reorderLevel: s.reorderLevel,
      onOrder: incoming,
      used30d: used.get(s.id) ?? 0,
      status,
      suggestedOrder,
      supplier: sup.get(s.id)?.supplier ?? null,
      lastCost: sup.get(s.id)?.lastCost ?? s.defaultCost ?? null,
    };
  });

  const attention = items
    .filter((i) => i.status !== "ok")
    .sort((a, b) => (a.status === b.status ? b.suggestedOrder - a.suggestedOrder : a.status === "out" ? -1 : 1));
  return {
    date: todayPH(),
    companyName: settings.companyName,
    totals: {
      materials: items.length,
      inStock: items.filter((i) => i.onHand > 0).length,
      stockValue: round2(stock.reduce((s, r) => s + Math.max(0, r.onHand) * r.defaultCost, 0)),
      low: items.filter((i) => i.status === "low").length,
      out: items.filter((i) => i.status === "out").length,
      toReorder: attention.filter((i) => i.suggestedOrder > 0).length,
    },
    attention,
    topUsed: items.filter((i) => i.used30d > 0).sort((a, b) => b.used30d - a.used30d).slice(0, 5),
  };
}

const itemLabel = (i: ReportItem) => `${i.name}${i.spec ? ` (${i.spec})` : ""}`;

/** The exact figures as plain text (for pasting where formatting is lost), so numbers never depend on the AI. */
export function factsText(d: StockReportData) {
  const lines = [
    `Stock summary — ${fmtDate(d.date)}`,
    `Materials in stock: ${d.totals.inStock} of ${d.totals.materials} · Stock value (default cost): ${peso(d.totals.stockValue)}`,
    `Out of stock: ${d.totals.out} · Low: ${d.totals.low} · Suggested to reorder: ${d.totals.toReorder}`,
  ];
  if (d.attention.length) {
    lines.push("", "NEEDS ATTENTION");
    for (const i of d.attention) {
      lines.push(
        `- ${itemLabel(i)}: ${i.status === "out" ? "OUT" : "LOW"} — ${num(i.onHand)} ${i.unit} on hand (reorder at ${num(i.reorderLevel)})` +
          (i.onOrder ? `, ${num(i.onOrder)} on order` : "") +
          (i.suggestedOrder ? ` → order ${num(i.suggestedOrder)} ${i.unit}` : " → enough on order") +
          (i.supplier ? ` from ${i.supplier}` : "") +
          (i.lastCost ? ` (last price ${peso(i.lastCost)})` : ""),
      );
    }
  }
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The exact figures as HTML (totals line + "Needs attention" table) — pasted below the written summary. */
export function reportTableHtml(d: StockReportData) {
  const td = "padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left";
  const rows = d.attention
    .map(
      (i) =>
        `<tr><td style="${td}">${esc(itemLabel(i))}</td>` +
        `<td style="${td};color:${i.status === "out" ? "#b91c1c" : "#b45309"};font-weight:600">${i.status === "out" ? "Out" : "Low"}</td>` +
        `<td style="${td}">${num(i.onHand)} ${esc(i.unit)}</td><td style="${td}">${num(i.reorderLevel)}</td>` +
        `<td style="${td}">${i.onOrder ? num(i.onOrder) : "—"}</td>` +
        `<td style="${td};font-weight:600">${i.suggestedOrder ? `${num(i.suggestedOrder)} ${esc(i.unit)}` : "—"}</td>` +
        `<td style="${td}">${esc(i.supplier ?? "—")}</td><td style="${td}">${i.lastCost ? peso(i.lastCost) : "—"}</td></tr>`,
    )
    .join("");
  const th = "padding:6px 8px;text-align:left;background:#0f5c4a;color:#fff;font-weight:600";
  const table = d.attention.length
    ? `<h3 style="margin:20px 0 8px;font-size:15px">Needs attention</h3>
       <table style="border-collapse:collapse;font-size:13px">
         <tr><th style="${th}">Material</th><th style="${th}">Status</th><th style="${th}">On hand</th><th style="${th}">Reorder at</th>
             <th style="${th}">On order</th><th style="${th}">Suggested order</th><th style="${th}">Supplier</th><th style="${th}">Last price</th></tr>
         ${rows}
       </table>`
    : `<p style="margin:16px 0;color:#047857">Nothing is low or out of stock.</p>`;
  return `<p style="margin:16px 0 4px;color:#475569">Materials in stock: ${d.totals.inStock} of ${d.totals.materials} · Stock value: ${peso(d.totals.stockValue)} ·
      Out: ${d.totals.out} · Low: ${d.totals.low} · To reorder: ${d.totals.toReorder}</p>
    ${table}
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">From the ${esc(d.companyName)} PO System · figures as of ${fmtDate(d.date)}</p>`;
}

/** Written summary without AI (no API key, or the AI call failed). */
function templateEmail(d: StockReportData) {
  const reorder = d.attention.filter((i) => i.suggestedOrder > 0);
  const subject =
    d.totals.out + d.totals.low === 0
      ? `Stock update ${fmtDate(d.date)}: all materials above reorder level`
      : `Stock update ${fmtDate(d.date)}: ${d.totals.out} out, ${d.totals.low} low, ${reorder.length} to reorder`;
  const body = [
    "Hi team,",
    d.totals.out + d.totals.low === 0
      ? "All materials are above their reorder levels. No orders are needed right now."
      : `${d.totals.out} material(s) are out of stock and ${d.totals.low} are running low. ` +
        (reorder.length
          ? `Suggested orders: ${reorder.slice(0, 6).map((i) => `${num(i.suggestedOrder)} ${i.unit} ${itemLabel(i)}${i.supplier ? ` (${i.supplier})` : ""}`).join("; ")}${reorder.length > 6 ? "; and more below" : ""}.`
          : "Enough is already on order for these items."),
    "The full list is below.",
  ].join("\n\n");
  return { subject, body };
}

const EmailSchema = z.object({
  subject: z.string().describe("Email subject line, under 90 characters"),
  body: z.string().describe("Plain-text email body: greeting, 2–4 short paragraphs, sign-off. No tables or markdown."),
});

const SYSTEM = `You write short internal email updates about warehouse stock for a solar installation company in the Philippines.
Readers are the purchasing team and management. Write plainly and briefly, in English.
Use only the figures in the data you are given; never invent quantities, prices or suppliers. Amounts are in Philippine pesos (₱).
The email will have an exact table of every item needing attention appended below your text, so summarise rather than list everything:
lead with what needs action (items out of stock, then low items with suggested order quantities and suppliers), group by supplier when that
makes ordering easier, mention items already covered by open orders, and note the fastest-moving materials if useful.
If nothing is low or out, say so in one or two sentences. Sign off as "— {company} PO System".`;

/**
 * Writes the email with Claude when ANTHROPIC_API_KEY is set, otherwise (or if the call fails) with a
 * plain template. Returns which one was used.
 */
export async function writeStockEmail(d: StockReportData): Promise<{ subject: string; body: string; ai: boolean; note?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ...templateEmail(d), ai: false, note: "No ANTHROPIC_API_KEY set — used the standard summary." };
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  try {
    // Server-side fallback: if the model declines, the API re-runs the request on a fallback model.
    const response = await client.beta.messages.parse({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(EmailSchema) },
      system: SYSTEM.replace("{company}", d.companyName),
      messages: [{ role: "user", content: `Stock data (JSON):\n${JSON.stringify(d)}\n\nWrite the stock update email.` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { ...templateEmail(d), ai: false, note: "The AI didn’t return a summary — used the standard summary." };
    }
    return { ...response.parsed_output, ai: true };
  } catch (e) {
    const why =
      e instanceof Anthropic.AuthenticationError
        ? "the API key was rejected"
        : e instanceof Anthropic.RateLimitError
          ? "the AI service is busy (rate limited)"
          : e instanceof Anthropic.APIError
            ? `the AI service returned an error${e.status ? ` (${e.status})` : ""}`
            : "the AI service couldn’t be reached";
    console.error("Stock report AI error:", e);
    return { ...templateEmail(d), ai: false, note: `Used the standard summary because ${why}.` };
  }
}
