import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listBundles } from "@/lib/bundles";
import { peso } from "@/lib/format";
import { round2 } from "@/lib/po";

export const metadata = { title: "Bundles" };

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const { saved } = await searchParams;
  const bundles = await listBundles();
  const savedName = bundles.find((b) => b.id === Number(saved))?.name;
  return (
    <>
      <PageHeader
        title="Bundles"
        subtitle="Saved sets of materials (e.g. a complete 8kW system) you can add to a PO in one step."
        actions={<Link href="/bundles/new" className="btn btn-primary">+ New bundle</Link>}
      />
      {savedName && <p className="ok-box mb-4">Saved “{savedName}”.</p>}
      <div className="card overflow-x-auto">
        {bundles.length === 0 ? (
          <Empty>
            No bundles yet. <Link className="text-brand-600 underline" href="/bundles/new">Create one</Link> — you can paste the
            materials straight from a spreadsheet.
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Bundle</th><th>Suppliers</th><th className="num">Items</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {bundles.map((b) => {
                const suppliers = [...new Set(b.items.map((i) => i.supplierName ?? "No supplier"))];
                const total = round2(b.items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
                return (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td>
                      <Link className="font-medium text-brand-700 hover:underline" href={`/bundles/${b.id}`}>{b.name}</Link>
                      {b.description && <div className="text-xs text-slate-500">{b.description}</div>}
                    </td>
                    <td className="max-w-xs truncate">{suppliers.join(", ")}</td>
                    <td className="num">{b.items.length}</td>
                    <td className="num">{peso(total)}</td>
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
