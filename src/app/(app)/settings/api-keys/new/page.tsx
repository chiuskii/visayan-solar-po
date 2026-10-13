import { ApiKeyForm } from "@/components/api-key-form";
import { PageHeader } from "@/components/ui";
import { featureOptions } from "@/lib/api-keys";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "New API key" };

export default async function NewApiKeyPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New API key" back={{ href: "/settings/api-keys", label: "API keys" }} />
      <ApiKeyForm id={null} features={featureOptions()} />
    </>
  );
}
