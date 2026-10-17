import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { queryOne } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, num } from "@/lib/format";
import { getJobOrder } from "@/lib/job-orders";
import { getSettings } from "@/lib/po";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const jo = await getJobOrder(Number((await params).id));
  return { title: jo ? jo.joNumber : "Job order" };
}

export default async function PrintJobOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sig?: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  const { sig } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const [jo, co] = await Promise.all([getJobOrder(id), getSettings()]);
  if (!jo) notFound();
  // E-signature of whoever prepared it: on by default per Settings, switchable with ?sig=0 / ?sig=1.
  const showSig = sig === undefined ? co.showSignatures : sig === "1";
  const preparedSig =
    showSig && jo.createdById
      ? ((await queryOne<{ signature: string | null }>("SELECT signature FROM users WHERE id = ?", [jo.createdById]))?.signature ?? null)
      : null;
  const client = jo.client;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-between px-4 print:hidden">
        <Link href={`/inventory/job-orders/${id}`} className="btn">← Back to job order</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/job-orders/${id}/print?sig=${showSig ? 0 : 1}`} className="btn" replace>
            {showSig ? "Hide e-signature" : "Show e-signature"}
          </Link>
          <PrintButton />
        </div>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] leading-snug text-slate-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-brand-600 pb-4">
          <div className="flex items-start gap-4">
            <img src="/logo.png" alt="" className="h-20 w-auto shrink-0" />
            <div>
              <div className="text-xl font-bold text-brand-700">{co.companyName}</div>
              {co.address && <div className="whitespace-pre-line text-slate-600">{co.address}</div>}
              <div className="text-slate-600">{[co.phone, co.email].filter(Boolean).join(" · ")}</div>
              {co.tin && <div className="text-slate-600">TIN: {co.tin}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tracking-wide">JOB ORDER</div>
            <table className="mt-2 ml-auto text-left">
              <tbody>
                <tr><td className="pr-3 text-slate-500">JO No.</td><td className="font-semibold">{jo.joNumber}</td></tr>
                <tr><td className="pr-3 text-slate-500">Date</td><td>{fmtDate(jo.joDate)}</td></tr>
                {jo.reference && <tr><td className="pr-3 text-slate-500">Reference</td><td>{jo.reference}</td></tr>}
                {jo.status === "CANCELLED" && <tr><td colSpan={2} className="font-bold text-red-600">CANCELLED</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Client / project</div>
            <div className="font-semibold">{client?.name ?? jo.reference ?? "—"}</div>
            {client?.address && <div className="whitespace-pre-line">{client.address}</div>}
            {client?.contactPerson && <div>Contact: {client.contactPerson}{client.phone ? ` · ${client.phone}` : ""}</div>}
            {!client?.contactPerson && client?.phone && <div>{client.phone}</div>}
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Issued from</div>
            <div className="font-semibold">{co.companyName} warehouse</div>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="bg-brand-600 text-left text-white">
              <th className="px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Material</th>
              <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
              <th className="px-2 py-1.5 font-semibold">Unit</th>
              <th className="w-28 px-2 py-1.5 font-semibold">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {jo.items.map((i, n) => (
              <tr key={i.id} className="border-b border-slate-200 align-top">
                <td className="px-2 py-1.5 text-slate-500">{n + 1}</td>
                <td className="px-2 py-1.5">{i.description}{i.spec && <span className="text-slate-600"> — {i.spec}</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{num(i.quantity)}</td>
                <td className="px-2 py-1.5">{i.unit}</td>
                <td className="px-2 py-1.5"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {jo.notes && (
          <section className="mt-6">
            <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Notes</div>
            <p className="whitespace-pre-line">{jo.notes}</p>
          </section>
        )}

        <section className="mt-10 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="flex h-16 items-end justify-center">
              {preparedSig && <img src={preparedSig} alt="Signature" className="-mb-2 max-h-16 max-w-[85%] object-contain" />}
            </div>
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">{jo.createdByName ?? " "}</div>
            {jo.createdByDesignation && <div className="text-slate-600">{jo.createdByDesignation}</div>}
            <div className="text-slate-500">Prepared / issued by</div>
          </div>
          <div>
            <div className="h-16" />
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">&nbsp;</div>
            <div className="text-slate-500">Approved by</div>
          </div>
          <div>
            <div className="h-16" />
            <div className="min-h-6 border-t border-slate-800 pt-1 font-medium">&nbsp;</div>
            <div className="text-slate-500">Received by / date</div>
          </div>
        </section>
      </article>
    </div>
  );
}
