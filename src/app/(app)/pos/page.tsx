import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { query } from "@/db";
import { PO_STATUSES, type PoStatus } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { fmtDate, peso, STATUS_LABEL } from "@/lib/format";

export const metadata = { title: "Purchase Orders" };

type SP = { q?: string; status?: string; client?: string };

export default async function PoListPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = PO_STATUSES.includes(sp.status as never) ? (sp.status as (typeof PO_STATUSES)[number]) : undefined;
  const clientId = Number(sp.client) || undefined;

  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    where.push("po.status = ?");
    params.push(status);
  }
  if (clientId) {
    where.push("po.client_id = ?");
    params.push(clientId);
  }
  if (q) {
    where.push(
      `(po.po_number LIKE ? OR c.name LIKE ? OR EXISTS (
         SELECT 1 FROM po_items x JOIN suppliers s ON s.id = x.supplier_id WHERE x.po_id = po.id AND s.name LIKE ?))`,
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = await query<{
    id: number;
    poNumber: string;
    poDate: string;
    expectedDate: string | null;
    status: PoStatus;
    vatRate: number;
    discount: number;
    clientName: string;
    supplierName: string | null;
    subtotal: number;
    lines: number;
  }>(
    `SELECT po.id, po.po_number AS poNumber, po.po_date AS poDate, po.expected_date AS expectedDate, po.status,
            po.vat_rate AS vatRate, po.discount, c.name AS clientName,
            (SELECT GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ')
             FROM po_items x JOIN suppliers s ON s.id = x.supplier_id WHERE x.po_id = po.id) AS supplierName,
            COALESCE(SUM(pi.quantity * pi.unit_cost), 0) AS subtotal, COUNT(pi.id) AS \`lines\`
     FROM purchase_orders po
     JOIN clients c ON c.id = po.client_id
     LEFT JOIN po_items pi ON pi.po_id = po.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY po.id, c.name
     ORDER BY po.po_date DESC, po.id DESC
     LIMIT 300`,
    params,
  );

  const clientOpts = await query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name");
  const total = (r: (typeof rows)[number]) => {
    const net = Math.max(0, Number(r.subtotal) - r.discount);
    return net + (net * r.vatRate) / 100;
  };

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle={`${rows.length} shown`}
        actions={<Link href="/pos/new" className="btn btn-primary">+ New PO</Link>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="PO no., client or supplier" />
        <select className="input w-auto" name="client" defaultValue={clientId ?? ""}>
          <option value="">All clients</option>
          {clientOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn">Filter</button>
        {(q || status || clientId) && <Link href="/pos" className="btn">Clear</Link>}
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No purchase orders match. <Link className="text-brand-600 underline" href="/pos/new">Create a PO</Link>.</Empty>
        ) : (
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>PO No.</th><th>Date</th><th>Client</th><th>Supplier</th><th className="num">Lines</th><th className="num">Total</th><th>Expected</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td><Link href={`/pos/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.poNumber}</Link></td>
                  <td className="whitespace-nowrap">{fmtDate(r.poDate)}</td>
                  <td>{r.clientName}</td>
                  <td>{r.supplierName}</td>
                  <td className="num">{Number(r.lines)}</td>
                  <td className="num">{peso(total(r))}</td>
                  <td className="whitespace-nowrap">{fmtDate(r.expectedDate)}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
