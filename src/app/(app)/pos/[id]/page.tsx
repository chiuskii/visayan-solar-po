import Link from "next/link";
import { notFound } from "next/navigation";
import { approvePo, cancelPo, createDelivery, deleteDelivery, deletePo, reopenPo, returnPo, submitPo } from "@/app/actions/pos";
import { ApprovalPanel } from "@/components/approval-panel";
import { ConfirmButton, SubmitButton } from "@/components/client-ui";
import { DeliveryForm } from "@/components/delivery-form";
import { PageHeader, StatusBadge } from "@/components/ui";
import { queryOne } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso, todayPH } from "@/lib/format";
import { getSettings } from "@/lib/po";
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
  const [detail, settings] = await Promise.all([getPoDetail(id), getSettings()]);
  if (!detail) notFound();
  const { po, client, items, totals, bySupplier } = detail;
  const multiSupplier = bySupplier.length > 1;
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const canApproveThis = po.status === "PENDING" && user.canApprove && po.createdById !== user.id;
  const mySignature = canApproveThis
    ? ((await queryOne<{ signature: string | null }>("SELECT signature FROM users WHERE id = ?", [user.id]))?.signature ?? null)
    : null;
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
        subtitle={`${client.name} · from ${bySupplier.map((g) => g.supplier.name).join(", ") || "—"}`}
        actions={
          <>
            <a href={`/pos/${id}/print`} target="_blank" className="btn">Print / PDF</a>
            {po.status !== "CANCELLED" && <Link href={`/pos/${id}/edit`} className="btn">Edit</Link>}
            {po.status === "DRAFT" && (
              <form action={submitPo.bind(null, id)}>
                <SubmitButton pendingText="Submitting…">{settings.requireApproval ? "Submit for approval" : "Mark as ordered"}</SubmitButton>
              </form>
            )}
            {po.status === "CANCELLED" ? (
              <form action={reopenPo.bind(null, id)}>
                <SubmitButton className="btn" pendingText="Reopening…">Reopen PO</SubmitButton>
              </form>
            ) : (
              po.status !== "DELIVERED" && <ConfirmButton action={cancelPo.bind(null, id)} label="Cancel PO" confirmLabel="Yes, cancel PO" />
            )}
            {user.role === "ADMIN" && (
              <ConfirmButton
                action={deletePo.bind(null, id)}
                label="Delete"
                confirmLabel={
                  detail.deliveries.length
                    ? `Delete PO and its ${detail.deliveries.length} ${detail.deliveries.length === 1 ? "delivery" : "deliveries"}`
                    : "Delete permanently"
                }
              />
            )}
          </>
        }
      />

      {sp.error === "stock-issued" && (
        <p className="error-box mb-4">
          Some of the stock from that delivery has already been issued, so it can’t be removed. Adjust or remove those issues in Inventory first.
        </p>
      )}
      {sp.error === "delete-stock-issued" && (
        <p className="error-box mb-4">
          This PO can’t be deleted: some of the stock its deliveries added to Inventory has already been issued. Adjust or remove those issues
          first, or cancel the PO instead.
        </p>
      )}
      {sp.saved === "delivery" && <p className="ok-box mb-4">Delivery saved.</p>}
      {sp.saved === "approved" && <p className="ok-box mb-4">Approved and signed. The PO is now ordered.</p>}
      {sp.saved === "returned" && <p className="ok-box mb-4">Returned to the preparer with your note.</p>}
      {sp.error === "not-approver" && <p className="error-box mb-4">Only users marked as approvers can approve POs.</p>}
      {sp.error === "own-po" && <p className="error-box mb-4">You prepared this PO, so another approver needs to approve it.</p>}
      {sp.error === "no-signature" && (
        <p className="error-box mb-4">
          Add your e-signature in <Link href="/account" className="underline">My account</Link> before approving.
        </p>
      )}
      {po.status === "DRAFT" && po.approvalNote && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div className="font-medium text-amber-900">Returned by the approver — please update and submit again:</div>
          <p className="mt-1 whitespace-pre-line">{po.approvalNote}</p>
        </div>
      )}
      {po.status === "PENDING" && !canApproveThis && (
        <p className="mb-4 rounded-md border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">
          Waiting for approval{po.createdById === user.id && user.canApprove ? " by another approver (you prepared this PO)" : ""}.
        </p>
      )}
      {canApproveThis && (
        <ApprovalPanel
          approve={approvePo.bind(null, id)}
          returnPo={returnPo.bind(null, id)}
          signature={mySignature}
          printHref={`/pos/${id}/print`}
        />
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card p-4 text-sm">
          <div className="label">Client</div>
          <Link href={`/clients/${client.id}`} className="font-medium text-brand-700 hover:underline">{client.name}</Link>
          {client.contactPerson && <div className="text-slate-600">{client.contactPerson}</div>}
          {po.toWarehouse && <div className="mt-2"><span className="inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Warehouse delivery → adds to stock</span></div>}
          {po.deliveryAddress && <div className="mt-2 whitespace-pre-line text-slate-600"><span className="label mb-0 inline">Deliver to: </span>{po.deliveryAddress}</div>}
        </div>
        <div className="card p-4 text-sm">
          <div className="label">{multiSupplier ? `Suppliers (${bySupplier.length})` : "Supplier"}</div>
          <ul className="space-y-2">
            {bySupplier.map(({ supplier, items: lines, totals: t }) => (
              <li key={supplier.id}>
                <div className="flex justify-between gap-2">
                  <Link href={`/suppliers/${supplier.id}`} className="font-medium text-brand-700 hover:underline">{supplier.name}</Link>
                  {multiSupplier && <span className="tabular-nums text-slate-600">{peso(t.total)}</span>}
                </div>
                <div className="text-slate-600">
                  {[supplier.contactPerson, supplier.phone].filter(Boolean).join(" · ")}
                  {multiSupplier && <span className="text-slate-400">{supplier.contactPerson || supplier.phone ? " · " : ""}{lines.length} {lines.length === 1 ? "line" : "lines"}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card grid grid-cols-2 gap-2 p-4 text-sm">
          <div><div className="label">PO date</div>{fmtDate(po.poDate)}</div>
          <div><div className="label">Expected</div>{fmtDate(po.expectedDate)}</div>
          <div><div className="label">Terms</div>{po.terms || "—"}</div>
          <div><div className="label">Prepared by</div>{detail.createdByName ?? "—"}{detail.createdByDesignation && <div className="text-xs text-slate-500">{detail.createdByDesignation}</div>}</div>
          <div className="col-span-2">
            <div className="label">Approved by</div>
            {detail.approvedByName ? (
              <>
                {detail.approvedByName}
                {detail.approvedByDesignation && <span className="text-slate-500"> · {detail.approvedByDesignation}</span>}
                <span className="text-xs text-slate-500"> · {fmtDate(po.approvedAt)}</span>
              </>
            ) : (
              <span className="text-slate-400">{po.status === "PENDING" ? "Waiting for approval" : "—"}</span>
            )}
          </div>
        </div>
      </div>

      <section className="card mb-6 overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3"><h2>Materials</h2></div>
        <table className="table min-w-[960px]">
          <thead>
            <tr>
              <th>Material</th><th>Supplier</th><th>Spec</th><th>Unit</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Amount</th><th className="num">Received</th><th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-medium">{i.description}</td>
                <td>{i.supplierName}</td>
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
            <tr><td colSpan={6} className="num text-slate-500">Subtotal</td><td className="num">{peso(totals.subtotal)}</td><td colSpan={2}></td></tr>
            {totals.discount > 0 && <tr><td colSpan={6} className="num text-slate-500">Discount</td><td className="num">−{peso(totals.discount)}</td><td colSpan={2}></td></tr>}
            {totals.vat > 0 && <tr><td colSpan={6} className="num text-slate-500">VAT ({po.vatRate}%)</td><td className="num">{peso(totals.vat)}</td><td colSpan={2}></td></tr>}
            <tr><td colSpan={6} className="num font-semibold">Total</td><td className="num font-semibold">{peso(totals.total)}</td><td colSpan={2}></td></tr>
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
          {canReceive && totalBalance > 0 && po.toWarehouse && (
            <p className="mb-3 text-xs text-slate-600">
              Received quantities are added to <Link className="text-brand-700 underline" href="/inventory">Inventory</Link>.
              {items.some((i) => !i.materialId) && " Custom lines (not picked from Materials) aren’t tracked in stock."}
            </p>
          )}
          {canReceive && totalBalance > 0 ? (
            <DeliveryForm action={createDelivery.bind(null, id)} items={items} today={todayPH()} />
          ) : (
            <p className="text-sm text-slate-500">
              {po.status === "DRAFT"
                ? "Submit this PO to start recording deliveries."
                : po.status === "PENDING"
                  ? "Deliveries can be recorded once this PO is approved."
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
