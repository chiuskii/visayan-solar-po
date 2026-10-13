import { notFound } from "next/navigation";
import { deleteApiKey } from "@/app/actions/api-keys";
import { ApiKeyForm } from "@/components/api-key-form";
import { ConfirmButton } from "@/components/client-ui";
import { PageHeader } from "@/components/ui";
import { featureOptions, getApiKey } from "@/lib/api-keys";
import { requireAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "API key" };

export default async function EditApiKeyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const k = await getApiKey(id);
  if (!k) notFound();
  return (
    <>
      <PageHeader
        title={k.name}
        subtitle={<>Key <span className="font-mono">{k.keyPrefix}…</span> · created {fmtDate(k.createdAt)}{k.createdByName ? ` by ${k.createdByName}` : ""}</>}
        back={{ href: "/settings/api-keys", label: "API keys" }}
      />
      <ApiKeyForm id={id} features={featureOptions()} initial={k} />
      <div className="card mt-6 max-w-3xl p-5">
        <h2 className="text-base font-semibold">Delete this key</h2>
        <p className="mt-1 mb-3 text-sm text-slate-600">Anything using it stops working straight away. To replace a key, create a new one first, switch over, then delete this one.</p>
        <ConfirmButton action={deleteApiKey.bind(null, id)} label="Delete key" confirmLabel="Yes, delete it" />
      </div>
    </>
  );
}
