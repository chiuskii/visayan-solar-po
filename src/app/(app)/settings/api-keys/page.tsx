import Link from "next/link";
import { setApiKeyActive } from "@/app/actions/api-keys";
import { Empty, PageHeader } from "@/components/ui";
import { API_FEATURES } from "@/db/types";
import { FEATURE_INFO, listApiKeys } from "@/lib/api-keys";
import { requireAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage({ searchParams }: { searchParams: Promise<{ saved?: string; removed?: string }> }) {
  await requireAdmin();
  const { saved, removed } = await searchParams;
  const keys = await listApiKeys();
  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="Keys that let other systems use this app’s data through /api/v1, with access set per feature."
        back={{ href: "/settings", label: "Settings" }}
        actions={<Link href="/settings/api-keys/new" className="btn btn-primary">+ New API key</Link>}
      />
      {saved && <p className="ok-box mb-4">API key saved.</p>}
      {removed && <p className="ok-box mb-4">API key deleted. Anything using it can no longer connect.</p>}
      {keys.length === 0 ? (
        <Empty>No API keys yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Key</th><th>Access</th><th>Expires</th><th>Last used</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>
                    <Link className="font-medium text-brand-700 hover:underline" href={`/settings/api-keys/${k.id}`}>{k.name}</Link>
                    {k.notes && <div className="text-xs text-slate-500">{k.notes}</div>}
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{k.keyPrefix}…</td>
                  <td className="text-sm">
                    {API_FEATURES.filter((f) => k.permissions[f]).map((f) => (
                      <span key={f} className={`mr-1 mb-1 inline-block rounded px-1.5 py-0.5 text-xs ${k.permissions[f] === "WRITE" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                        {FEATURE_INFO[f].label}: {k.permissions[f] === "WRITE" ? "Write" : "Read"}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap">{k.expiresAt ? fmtDate(k.expiresAt) : "Never"}</td>
                  <td className="text-sm whitespace-nowrap">{k.lastUsedAt ? <>{fmtDate(k.lastUsedAt)}<div className="text-xs text-slate-500">{k.lastUsedIp}</div></> : <span className="text-slate-400">Never</span>}</td>
                  <td>
                    {!k.active ? <span className="text-slate-400">Disabled</span> : k.expired ? <span className="text-red-700">Expired</span> : <span className="text-emerald-700">Active</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <form action={setApiKeyActive.bind(null, k.id, !k.active)}>
                      <button className="text-sm text-brand-700 hover:underline">{k.active ? "Disable" : "Enable"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card mt-6 max-w-3xl space-y-2 p-5 text-sm text-slate-700">
        <h2 className="text-base font-semibold">Using the API</h2>
        <p>Send the key with every request: <code>Authorization: Bearer vsk_…</code> (or <code>X-API-Key: vsk_…</code>). Responses are JSON.</p>
        <ul className="list-disc space-y-0.5 pl-5 font-mono text-xs">
          <li>GET /api/v1 — this key’s name and access</li>
          <li>GET /api/v1/purchase-orders?status=&amp;from=&amp;to=&amp;search= · GET /api/v1/purchase-orders/&#123;id or PO number&#125;</li>
          <li>GET /api/v1/inventory?search=&amp;filter=all|stock|low · GET /api/v1/inventory/&#123;materialId&#125;</li>
          <li>GET /api/v1/job-orders?client=&amp;status=&amp;from=&amp;to=&amp;search= · GET /api/v1/job-orders/&#123;id or JO number&#125;</li>
          <li>POST /api/v1/inventory/adjustments &#123; materialId, mode: &quot;set&quot;, quantity, notes, date? &#125; (counts only)</li>
          <li>GET · POST /api/v1/materials | suppliers | clients — GET · PATCH /api/v1/&lt;list&gt;/&#123;id&#125;</li>
          <li>GET /api/v1/bundles · GET /api/v1/bundles/&#123;id&#125;</li>
        </ul>
        <p>Lists take <code>?limit=</code> (up to 500) and <code>?offset=</code>. A key without access to a feature gets 403; a missing, wrong, disabled or expired key gets 401.</p>
      </div>
    </>
  );
}
