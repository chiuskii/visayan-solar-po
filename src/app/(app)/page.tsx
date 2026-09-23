import { desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { db } from "@/db";
import { clients, poItems, purchaseOrders, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, peso, todayPH } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  const counts = await db
    .select({ status: purchaseOrders.status, n: sql<number>`COUNT(*)` })
    .from(purchaseOrders)
    .groupBy(purchaseOrders.status);
  const count = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);

  const [openValue] = await db
    .select({ v: sql<string>`COALESCE(SUM(${poItems.quantity} * ${poItems.unitCost}), 0)` })
    .from(poItems)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, poItems.poId))
    .where(inArray(purchaseOrders.status, ["ORDERED", "PARTIAL"]));

  const open = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      expectedDate: purchaseOrders.expectedDate,
      clientName: clients.name,
      supplierName: suppliers.name,
    })
    .from(purchaseOrders)
    .innerJoin(clients, eq(clients.id, purchaseOrders.clientId))
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(inArray(purchaseOrders.status, ["DRAFT", "ORDERED", "PARTIAL"]))
    .orderBy(sql`${purchaseOrders.expectedDate} IS NULL`, purchaseOrders.expectedDate, desc(purchaseOrders.id))
    .limit(15);

  const today = todayPH();
  const tiles = [
    { label: "Drafts", value: count("DRAFT"), href: "/pos?status=DRAFT" },
    { label: "Awaiting delivery", value: count("ORDERED"), href: "/pos?status=ORDERED" },
    { label: "Partially delivered", value: count("PARTIAL"), href: "/pos?status=PARTIAL" },
    { label: "Delivered", value: count("DELIVERED"), href: "/pos?status=DELIVERED" },
  ];

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        subtitle="Open purchase orders at a glance."
        actions={<Link href="/pos/new" className="btn btn-primary">+ New PO</Link>}
      />
      {denied && <p className="error-box mb-4">That page is for admins only.</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card p-4 hover:border-brand-600">
            <div className="text-xs text-slate-500">{t.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
          </Link>
        ))}
        <div className="card col-span-2 p-4 lg:col-span-1">
          <div className="text-xs text-slate-500">Open PO value (before VAT)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{peso(Number(openValue?.v))}</div>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3"><h2>Open POs by expected delivery</h2></div>
        {open.length === 0 ? (
          <Empty>No open POs. <Link href="/pos/new" className="text-brand-600 underline">Create one</Link>.</Empty>
        ) : (
          <table className="table min-w-[640px]">
            <thead><tr><th>PO No.</th><th>Client</th><th>Supplier</th><th>Expected</th><th>Status</th></tr></thead>
            <tbody>
              {open.map((r) => {
                const late = r.expectedDate && r.expectedDate < today;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td><Link className="font-medium text-brand-700 hover:underline" href={`/pos/${r.id}`}>{r.poNumber}</Link></td>
                    <td>{r.clientName}</td>
                    <td>{r.supplierName}</td>
                    <td className={late ? "font-medium text-red-600" : ""}>{fmtDate(r.expectedDate)}{late ? " · overdue" : ""}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
