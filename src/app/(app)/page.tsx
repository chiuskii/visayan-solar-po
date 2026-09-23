import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { query, queryOne } from "@/db";
import type { PoStatus } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { fmtDate, peso, todayPH } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;

  const counts = await query<{ status: PoStatus; n: number }>(
    "SELECT status, COUNT(*) AS n FROM purchase_orders GROUP BY status",
  );
  const count = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);

  const openValue = await queryOne<{ v: number }>(
    `SELECT COALESCE(SUM(pi.quantity * pi.unit_cost), 0) AS v
     FROM po_items pi
     JOIN purchase_orders po ON po.id = pi.po_id
     WHERE po.status IN ('ORDERED', 'PARTIAL')`,
  );

  const open = await query<{
    id: number;
    poNumber: string;
    status: PoStatus;
    expectedDate: string | null;
    clientName: string;
    supplierName: string;
  }>(
    `SELECT po.id, po.po_number AS poNumber, po.status, po.expected_date AS expectedDate,
            c.name AS clientName, s.name AS supplierName
     FROM purchase_orders po
     JOIN clients c ON c.id = po.client_id
     JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.status IN ('DRAFT', 'ORDERED', 'PARTIAL')
     ORDER BY po.expected_date IS NULL, po.expected_date, po.id DESC
     LIMIT 15`,
  );

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
