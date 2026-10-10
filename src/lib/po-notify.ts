import "server-only";
import { headers } from "next/headers";
import { query, queryOne } from "@/db";
import { fmtDate, peso } from "./format";
import type { PoDetail } from "./po-queries";

/** The app's address for links in emails: APP_URL if set, else the address this request came in on. */
export async function appBaseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

type Person = { id: number; name: string; email: string; designation: string | null };

/** Who to ask for approval: active approvers other than the preparer; if there are none, the admins. */
export async function approversFor(preparerId: number | null) {
  const approvers = await query<Person>(
    "SELECT id, name, email, designation FROM users WHERE active = 1 AND can_approve = 1 AND id <> ? ORDER BY name",
    [preparerId ?? 0],
  );
  if (approvers.length) return approvers;
  return query<Person>("SELECT id, name, email, designation FROM users WHERE active = 1 AND role = 'ADMIN' AND id <> ? ORDER BY name", [
    preparerId ?? 0,
  ]);
}

export async function userById(id: number | null) {
  if (!id) return null;
  return (await queryOne<Person>("SELECT id, name, email, designation FROM users WHERE id = ?", [id])) ?? null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0];
const signOff = (p: Person) => [p.name, p.designation].filter(Boolean).join("\n");

function poSummary(d: PoDetail) {
  const deliverTo = d.client ? d.client.name : d.po.toWarehouse ? "Warehouse" : "Direct to site";
  return [
    `PO date: ${fmtDate(d.po.poDate)}`,
    ...(d.po.expectedDate ? [`Expected delivery: ${fmtDate(d.po.expectedDate)}`] : []),
    `Deliver to: ${deliverTo}`,
    "",
    "Suppliers:",
    ...d.bySupplier.map((g) => `- ${g.supplier.name}: ${peso(g.totals.total)} (${g.items.length} line${g.items.length === 1 ? "" : "s"})`),
    "",
    `Total: ${peso(d.totals.total)}${d.totals.vat > 0 ? " incl. VAT" : ""}`,
  ].join("\n");
}

/** The preparer's request to the approvers. */
export function approvalRequestEmail(d: PoDetail, preparer: Person, approvers: Person[], link: string) {
  const greeting = approvers.length === 1 ? `Hi ${firstName(approvers[0].name)},` : "Hi,";
  return {
    subject: `PO ${d.po.poNumber} needs your approval`,
    body: [
      greeting,
      "",
      `I've submitted ${d.po.poNumber} for your approval.`,
      "",
      poSummary(d),
      "",
      `Review and approve: ${link}`,
      "",
      "Thank you,",
      signOff(preparer),
    ].join("\n"),
  };
}

/** The approver's reply to the preparer once they've approved or returned the PO. */
export function decisionEmail(d: PoDetail, approver: Person, preparer: Person, link: string) {
  const approved = d.po.status !== "DRAFT";
  // approvalNote is stored as "<note>\n— <approver name>"; the email signs off on its own.
  const note = (d.po.approvalNote ?? "").replace(/\n— [^\n]*$/, "").trim();
  return {
    subject: approved ? `PO ${d.po.poNumber} approved` : `PO ${d.po.poNumber} returned: changes needed`,
    body: [
      `Hi ${firstName(preparer.name)},`,
      "",
      approved
        ? `I've approved ${d.po.poNumber} (${peso(d.totals.total)}). It's now ordered and ready to send to the suppliers.`
        : `I've returned ${d.po.poNumber} to draft. Please update it and submit it again:`,
      ...(approved || !note ? [] : ["", note]),
      "",
      `Open the PO: ${link}`,
      "",
      "Thank you,",
      signOff(approver),
    ].join("\n"),
  };
}
