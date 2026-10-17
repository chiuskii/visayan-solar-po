import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelJobOrder } from "@/app/actions/inventory";
import { ConfirmButton } from "@/components/client-ui";
import { JoStatusBadge } from "@/components/stock-ui";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/format";
import { getJobOrder } from "@/lib/job-orders";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const jo = await getJobOrder(Number((await params).id));
  return { title: jo ? jo.joNumber : "Job order" };
}

export default async function JobOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const { saved } = await searchParams;
  const jo = await getJobOrder(id);
  if (!jo) notFound();
  const cancelled = jo.status === "CANCELLED";

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{jo.joNumber} <JoStatusBadge status={jo.status} /></span>}
        subtitle={`Job order · ${fmtDate(jo.joDate)}`}
        back={{ href: "/inventory/job-orders", label: "Job orders" }}
        actions={
          <>
            {jo.clientId && <Link href={`/inventory/issue?client=${jo.clientId}`} className="btn">Assign more</Link>}
            <Link href={`/job-orders/${id}/print`} className="btn btn-primary">Print</Link>
          </>
        }
      />
      {saved === "created" && <p className="ok-box mb-4 max-w-3xl">Materials assigned and job order {jo.joNumber} created. Print it for the team / client to sign.</p>}
      {saved === "cancelled" && <p className="ok-box mb-4 max-w-3xl">Job order cancelled. Its materials are back in stock.</p>}
      {cancelled && (
        <p className="error-box mb-4 max-w-3xl">
          Cancelled{jo.cancelledByName ? ` by ${jo.cancelledByName}` : ""}{jo.cancelledAt ? ` on ${fmtDate(jo.cancelledAt)}` : ""}. Its materials were returned to stock.
        </p>
      )}

      <div className="card mb-6 grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
        <div>
          <div className="text-xs text-slate-500">Client / project</div>
          {jo.client ? (
            <>
              <Link href={`/clients/${jo.client.id}`} className="font-medium text-brand-700 hover:underline">{jo.client.name}</Link>
              {jo.client.address && <div className="text-sm whitespace-pre-line text-slate-600">{jo.client.address}</div>}
            </>
          ) : (
            <div className="font-medium">—</div>
          )}
        </div>
        <div>
          <div className="text-xs text-slate-500">Reference</div>
          <div>{jo.reference ?? "—"}</div>
          <div className="mt-2 text-xs text-slate-500">Prepared by</div>
          <div>{jo.createdByName ?? "—"}</div>
        </div>
        {jo.notes && (
          <div className="sm:col-span-2">
            <div className="text-xs text-slate-500">Notes</div>
            <p className="whitespace-pre-line">{jo.notes}</p>
          </div>
        )}
      </div>

      <div className="card max-w-3xl overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Material</th><th className="num">Qty</th><th>Unit</th></tr></thead>
          <tbody>
            {jo.items.map((i, n) => (
              <tr key={i.id} className={cancelled ? "text-slate-400 line-through" : ""}>
                <td className="text-slate-500">{n + 1}</td>
                <td>
                  {i.materialId ? <Link className="text-brand-700 hover:underline" href={`/inventory/${i.materialId}`}>{i.description}</Link> : i.description}
                  {i.spec && <span className="text-slate-500"> · {i.spec}</span>}
                </td>
                <td className="num">{num(i.quantity)}</td>
                <td>{i.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {user.role === "ADMIN" && !cancelled && (
        <div className="card mt-6 max-w-3xl p-5">
          <h2 className="text-base font-semibold">Cancel this job order</h2>
          <p className="mt-1 mb-3 text-sm text-slate-600">Puts all its materials back in stock and marks it cancelled. The job order number is kept, not reused.</p>
          <ConfirmButton action={cancelJobOrder.bind(null, id)} label="Cancel job order" confirmLabel="Yes, cancel and return stock" />
        </div>
      )}
    </>
  );
}
