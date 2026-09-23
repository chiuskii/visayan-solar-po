import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/db";
import { clients, PO_STATUSES, poItems, purchaseOrders, suppliers } from "@/db/schema";
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

  const where: SQL[] = [];
  if (status) where.push(eq(purchaseOrders.status, status));
  if (clientId) where.push(eq(purchaseOrders.clientId, clientId));
  if (q) where.push(or(like(purchaseOrders.poNumber, `%${q}%`), like(clients.name, `%${q}%`), like(suppliers.name, `%${q}%`))!);

  const subtotal = sql<string>`COALESCE(SUM(${poItems.quantity} * ${poItems.unitCost}), 0)`;
  const rows = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      poDate: purchaseOrders.poDate,
      expectedDate: purchaseOrders.expectedDate,
      status: purchaseOrders.status,
      vatRate: purchaseOrders.vatRate,
      discount: purchaseOrders.discount,
      clientName: clients.name,
      supplierName: suppliers.name,
      subtotal,
      lines: sql<number>`COUNT(${poItems.id})`,
    })
    .from(purchaseOrders)
    .innerJoin(clients, eq(clients.id, purchaseOrders.clientId))
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(poItems, eq(poItems.poId, purchaseOrders.id))
    .where(where.length ? and(...where) : undefined)
    .groupBy(purchaseOrders.id, clients.name, suppliers.name)
    .orderBy(desc(purchaseOrders.poDate), desc(purchaseOrders.id))
    .limit(300);

  const clientOpts = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name);
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
