import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { projectCost } from "@/lib/project-cost";

export const dynamic = "force-dynamic";

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The project cost report as one CSV table (one row per material / PO line, then totals), for the P&L. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const r = await projectCost(Number(url.searchParams.get("client")) || 0, {
    from: isDate(from) ? from! : undefined,
    to: isDate(to) ? to! : undefined,
  });
  if (!r) return new Response("Choose a client.", { status: 404 });

  const rows: (string | number | null)[][] = [
    ["Section", "Reference", "Date", "Status", "Supplier", "Material / description", "Spec", "Unit", "Qty", "Unit cost", "Amount", "Notes"],
  ];
  for (const w of r.warehouse) {
    const notes = [`issued ${w.issued}`, w.returned ? `returned ${w.returned}` : null, w.estimated ? "default cost used where none was recorded" : null];
    rows.push(["Warehouse", null, null, null, null, w.name, w.spec, w.unit, w.net, w.net ? Math.round((w.cost / w.net) * 100) / 100 : null, w.cost, notes.filter(Boolean).join("; ")]);
  }
  for (const po of r.direct) {
    for (const l of po.lines) {
      rows.push([
        "Direct PO", po.poNumber, po.poDate, po.status, l.supplier, l.description, l.spec, l.unit, l.quantity, l.unitCost, l.amount,
        l.received < l.quantity ? `received ${l.received} of ${l.quantity}` : "received",
      ]);
    }
    if (po.discount > 0) rows.push(["Direct PO", po.poNumber, po.poDate, po.status, null, "Discount", null, null, null, null, -po.discount, null]);
  }
  rows.push([]);
  rows.push(["Total", null, null, null, null, "Warehouse materials", null, null, null, null, r.totals.warehouse, null]);
  rows.push(["Total", null, null, null, null, "Direct-to-site POs (before VAT)", null, null, null, null, r.totals.directNet, null]);
  rows.push(["Total", null, null, null, null, "Materials cost", null, null, null, null, r.totals.materials, "before VAT"]);
  if (r.totals.directVat > 0) rows.push(["Total", null, null, null, null, "Direct-to-site PO VAT (not in materials cost)", null, null, null, null, r.totals.directVat, null]);

  const slug = r.client.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "client";
  const period = [from, to].filter(isDate).join("_to_");
  const filename = `project-cost-${slug}${period ? `-${period}` : ""}.csv`;
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}
