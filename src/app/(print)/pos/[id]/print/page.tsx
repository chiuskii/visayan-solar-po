import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso } from "@/lib/format";
import { getSettings } from "@/lib/po";
import { getPoDetail } from "@/lib/po-queries";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPoDetail(Number((await params).id));
  return { title: d ? d.po.poNumber : "PO" };
}

export default async function PrintPoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [detail, co] = await Promise.all([getPoDetail(id), getSettings()]);
  if (!detail) notFound();
  const { po, client, supplier, items, totals } = detail;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-between px-4 print:hidden">
        <Link href={`/pos/${id}`} className="btn">← Back to PO</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-snug text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
          <div>
            <div className="text-xl font-bold text-brand-700">{co.companyName}</div>
            {co.address && <div className="whitespace-pre-line text-slate-600">{co.address}</div>}
            <div className="text-slate-600">
              {[co.phone, co.email].filter(Boolean).join(" · ")}
            </div>
            {co.tin && <div className="text-slate-600">TIN: {co.tin}</div>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wide">PURCHASE ORDER</div>
            <table className="mt-2 ml-auto text-left">
              <tbody>
                <tr><td className="pr-3 text-slate-500">PO No.</td><td className="font-semibold">{po.poNumber}</td></tr>
                <tr><td className="pr-3 text-slate-500">Date</td><td>{fmtDate(po.poDate)}</td></tr>
                {po.expectedDate && <tr><td className="pr-3 text-slate-500">Deliver by</td><td>{fmtDate(po.expectedDate)}</td></tr>}
                {po.terms && <tr><td className="pr-3 text-slate-500">Terms</td><td>{po.terms}</td></tr>}
                {po.status === "CANCELLED" && <tr><td colSpan={2} className="font-bold text-red-600">CANCELLED</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Supplier</div>
            <div className="font-semibold">{supplier.name}</div>
            {supplier.contactPerson && <div>Attn: {supplier.contactPerson}</div>}
            {supplier.address && <div className="whitespace-pre-line">{supplier.address}</div>}
            {[supplier.phone, supplier.email].filter(Boolean).length > 0 && <div>{[supplier.phone, supplier.email].filter(Boolean).join(" · ")}</div>}
            {supplier.tin && <div>TIN: {supplier.tin}</div>}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Deliver to</div>
            <div className="font-semibold">{client.name}</div>
            <div className="whitespace-pre-line">{po.deliveryAddress || client.address || "—"}</div>
            {client.contactPerson && <div>Contact: {client.contactPerson}{client.phone ? ` · ${client.phone}` : ""}</div>}
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="bg-brand-600 text-left text-white">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Description</th>
              <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="px-2 py-1.5 font-semibold">Unit</th>
              <th className="px-2 py-1.5 text-right font-semibold">Unit price</th>
              <th className="px-2 py-1.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id} className="border-b border-slate-200 align-top">
                <td className="px-2 py-1.5 text-slate-500">{n + 1}</td>
                <td className="px-2 py-1.5">{i.description}{i.spec && <span className="text-slate-600"> — {i.spec}</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(i.quantity)}</td>
                <td className="px-2 py-1.5">{i.unit}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{peso(i.unitCost)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{peso(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <table className="w-72">
            <tbody>
              <tr><td className="py-0.5 text-slate-600">Subtotal</td><td className="text-right tabular-nums">{peso(totals.subtotal)}</td></tr>
              {totals.discount > 0 && <tr><td className="py-0.5 text-slate-600">Discount</td><td className="text-right tabular-nums">−{peso(totals.discount)}</td></tr>}
              {totals.vat > 0 && <tr><td className="py-0.5 text-slate-600">VAT ({po.vatRate}%)</td><td className="text-right tabular-nums">{peso(totals.vat)}</td></tr>}
              <tr className="border-t-2 border-slate-800 text-base font-bold"><td className="pt-1">TOTAL</td><td className="pt-1 text-right tabular-nums">{peso(totals.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {po.notes && (
          <section className="mt-6">
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Notes</div>
            <p className="whitespace-pre-line">{po.notes}</p>
          </section>
        )}
        {co.poFooter && <p className="mt-4 text-slate-600">{co.poFooter}</p>}

        <section className="mt-14 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">{detail.createdByName ?? "\u00a0"}</div>
            <div className="text-slate-500">Prepared by</div>
          </div>
          <div>
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">{co.approverName || "\u00a0"}</div>
            <div className="text-slate-500">Approved by{co.approverTitle ? ` · ${co.approverTitle}` : ""}</div>
          </div>
          <div>
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">&nbsp;</div>
            <div className="text-slate-500">Supplier conforme / date</div>
          </div>
        </section>
      </article>
    </div>
  );
}
