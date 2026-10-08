import Link from "next/link";
import { ReportForm } from "@/components/report-form";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, num, peso } from "@/lib/format";
import { mailConfig } from "@/lib/mailer";
import { getSettings } from "@/lib/po";
import { gatherStockReport } from "@/lib/stock-report";

export const metadata = { title: "Stock report" };

export default async function StockReportPage() {
  const user = await requireUser();
  const [data, settings] = await Promise.all([gatherStockReport(), getSettings()]);
  const ai = Boolean(process.env.ANTHROPIC_API_KEY);
  const mail = mailConfig();

  return (
    <>
      <PageHeader
        title="Stock report"
        subtitle="Email an update on current stock, low-stock items and what to reorder."
        back={{ href: "/inventory", label: "Inventory" }}
      />
      <div className="mb-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <ReportForm defaultTo={settings.reportRecipients ?? ""} canSend={Boolean(mail)} />
        <section className="card space-y-3 p-5 text-sm">
          <h2>Setup</h2>
          <div className="flex items-center justify-between gap-2">
            <span>AI summary</span>
            {ai ? <span className="font-medium text-emerald-700">On</span> : <span className="text-amber-700">Off — standard summary used</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Email sending</span>
            {mail ? <span className="font-medium text-emerald-700">From {mail.from}</span> : <span className="text-amber-700">Not set up</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Default recipients</span>
            <span className="text-right">
              {settings.reportRecipients || <span className="text-slate-400">None</span>}
              {user.role === "ADMIN" && <> · <Link href="/settings" className="text-brand-700 underline">Settings</Link></>}
            </span>
          </div>
          {(!ai || !mail) && (
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              An admin sets these in the server’s <code>.env</code> file, then restarts the app:{" "}
              {!ai && <><code>ANTHROPIC_API_KEY</code> for the AI summary; </>}
              {!mail && <><code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>SMTP_FROM</code> for sending.</>}
            </p>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2>Needs attention</h2>
          <span className="text-sm text-slate-500">
            {fmtDate(data.date)} · In stock {data.totals.inStock}/{data.totals.materials} · Value {peso(data.totals.stockValue)} · Out {data.totals.out} · Low{" "}
            {data.totals.low} · To reorder {data.totals.toReorder}
          </span>
        </div>
        {data.attention.length === 0 ? (
          <Empty>Nothing is low or out of stock. Set reorder levels on materials to get low-stock alerts.</Empty>
        ) : (
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th>Material</th><th>Status</th><th className="num">On hand</th><th className="num">Reorder at</th><th className="num">On order</th>
                <th className="num">Suggested order</th><th>Supplier</th><th className="num">Last price</th>
              </tr>
            </thead>
            <tbody>
              {data.attention.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/inventory/${i.id}`} className="text-brand-700 hover:underline">{i.name}</Link>{i.spec && <span className="text-slate-500"> · {i.spec}</span>}</td>
                  <td>{i.status === "out" ? <span className="font-semibold text-red-700">Out</span> : <span className="font-semibold text-amber-700">Low</span>}</td>
                  <td className="num">{num(i.onHand)} {i.unit}</td>
                  <td className="num">{num(i.reorderLevel)}</td>
                  <td className="num">{i.onOrder ? num(i.onOrder) : "—"}</td>
                  <td className="num font-medium">{i.suggestedOrder ? `${num(i.suggestedOrder)} ${i.unit}` : "—"}</td>
                  <td>{i.supplier ?? "—"}</td>
                  <td className="num">{i.lastCost ? peso(i.lastCost) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          Suggested order brings stock back up to twice the reorder level, after what’s already on order from open warehouse POs.
        </p>
      </section>
    </>
  );
}
