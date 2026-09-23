import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelPo, createDelivery, deleteDelivery, deletePo, markOrdered, reopenPo } from "@/app/actions/pos";
import { ConfirmButton, SubmitButton } from "@/components/client-ui";
import { DeliveryForm } from "@/components/delivery-form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso, todayPH } from "@/lib/format";
import { getPoDetail } from "@/lib/po-queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `PO #${(await params).id}` };
}

export default async function PoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const detail = await getPoDetail(id);
  if (!detail) notFound();
  const { po, client, supplier, items, totals } = detail;
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const totalBalance = items.reduce((s, i) => s + i.balance, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/pos", label: "Purchase Orders" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {po.poNumber} <StatusBadge status={po.status} />
          </span>
        }
        subtitle={`${client.name} · from ${supplier.name}`}
        actions={
          <>
            <a href={`/pos/${id}/print`} target="_blank" className="btn">Print / PDF</a>
            {po.status !== "CANCELLED" && <Link href={`/pos/${id}/edit`} className="btn">Edit</Link>}
            {po.status === "DRAFT" && (
              <form action={markOrdered.bind(null, id)}>
                <SubmitButton pendingText="Updating…">Mark as ordered</SubmitButton>
              </form>
            )}
            {po.status === "CANCELLED" ? (
              <form action={reopenPo.bind(null, id)}>
                <SubmitButton className="btn" pendingText="Reopening…">Reopen PO</SubmitButton>
              </form>
            ) : (
              po.status !== "DELIVERED" && <ConfirmButton action={cancelPo.bind(null, id)} label="Cancel PO" confirmLabel="Yes, cancel PO" />
            )}
            {user.role === "ADMIN" && detail.deliveries.length === 0 && (
              <ConfirmButton action={deletePo.bind(null, id)} label="Delete" confirmLabel="Delete permanently" />
            )}
          </>
        }
      />

      {sp.error === "has-deliveries" && <p className="error-box mb-4">This PO has deliveries recorded, so it can’t be deleted. Cancel it instead.</p>}
      {sp.saved === "delivery" && <p className="ok-box mb-4">Delivery saved.</p>}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card p-4 text-sm">
          <div className="label">Client</div>
          <Link href={`/clients/${client.id}`} className="font-medium text-brand-700 hover:underline">{client.name}</Link>
          {client.contactPerson && <div className="text-slate-600">{client.contactPerson}</div>}
          {po.deliveryAddress && <div className="mt-2 whitespace-pre-line text-slate-600"><span className="label mb-0 inline">Deliver to: </span>{po.deliveryAddress}</div>}
        </div>
        <div className="card p-4 text-sm">
          <div className="label">Supplier</div>
          <Link href={`/suppliers/${supplier.id}`} className="font-medium text-brand-700 hover:underline">{supplier.name}</Link>
          {supplier.contactPerson && <div className="text-slate-600">{supplier.contactPerson}</div>}
          {supplier.phone && <div className="text-slate-600">{supplier.phone}</div>}
        </div>
        <div className="card grid grid-cols-2 gap-2 p-4 text-sm">
          <div><div className="label">PO date</div>{fmtDate(po.poDate)}</div>
          <div><div className="label">Expected</div>{fmtDate(po.expectedDate)}</div>
          <div><div className="label">Terms</div>{po.terms || "—"}</div>
          <div><div className="label">Created by</div>{detail.createdByName ?? "—"}</div>
        </div>
      </div>

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3"><h2>Materials</h2></div>
        <table className="table min-w-[820px]">
          <thead>
            <tr>
              <th>Material</th><th>Spec</th><th>Unit</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Amount</th><th className="num">Received</th><th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-medium">{i.description}</td>
                <td>{i.spec || "—"}</td>
                <td>{i.unit}</td>
                <td className="num">{num(i.quantity)}</td>
                <td className="num">{peso(i.unitCost)}</td>
                <td className="num">{peso(i.amount)}</td>
                <td className="num">{num(i.received)}</td>
                <td className={`num font-medium ${i.balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{i.balance > 0 ? num(i.balance) : "✓"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr><td colSpan={5} className="num text-slate-500">Subtotal</td><td className="num">{peso(totals.subtotal)}</td><td colSpan={2}></td></tr>
            {totals.discount > 0 && <tr><td colSpan={5} className="num text-slate-500">Discount</td><td className="num">−{peso(totals.discount)}</td><td colSpan={2}></td></tr>}
            {totals.vat > 0 && <tr><td colSpan={5} className="num text-slate-500">VAT ({po.vatRate}%)</td><td className="num">{peso(totals.vat)}</td><td colSpan={2}></td></tr>}
            <tr><td colSpan={5} className="num font-semibold">Total</td><td className="num font-semibold">{peso(totals.total)}</td><td colSpan={2}></td></tr>
          </tfoot>
        </table>
      </section>

      {po.notes && (
        <section className="card mb-6 p-4 text-sm">
          <div className="label">Notes</div>
          <p className="whitespace-pre-line">{po.notes}</p>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="card p-4">
          <h2 className="mb-3">Record a delivery</h2>
          {canReceive && totalBalance > 0 ? (
            <DeliveryForm action={createDelivery.bind(null, id)} items={items} today={todayPH()} />
          ) : (
            <p className="text-sm text-slate-500">
              {po.status === "DRAFT"
                ? "Mark this PO as ordered to start recording deliveries."
                : po.status === "CANCELLED"
                  ? "This PO is cancelled."
                  : "Everything on this PO has been received."}
            </p>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-3">Delivery history</h2>
          {detail.deliveries.length === 0 ? (
            <p className="text-sm text-slate-500">No deliveries recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {detail.deliveries.map((d) => (
                <li key={d.id} className="rounded-md border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{fmtDate(d.deliveryDate)}{d.drNumber && <span className="text-slate-500"> · DR {d.drNumber}</span>}</div>
                      <div className="text-xs text-slate-500">
                        {d.receivedBy ? `Received by ${d.receivedBy}` : "Receiver not noted"}{d.byName ? ` · logged by ${d.byName}` : ""}
                      </div>
                    </div>
                    {user.role === "ADMIN" && (
                      <ConfirmButton action={deleteDelivery.bind(null, id, d.id)} label="Remove" confirmLabel="Remove delivery" className="btn btn-sm btn-danger" />
                    )}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {d.items.map((x, k) => (
                      <li key={k} className="flex justify-between gap-2">
                        <span>{x.description}{x.spec ? ` · ${x.spec}` : ""}</span>
                        <span className="tabular-nums">{num(x.quantity)} {x.unit}</span>
                      </li>
                    ))}
                  </ul>
                  {d.notes && <p className="mt-2 text-xs text-slate-600">{d.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
