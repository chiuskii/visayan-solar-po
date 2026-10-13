import Link from "next/link";
import { SettingsForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/po";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const { id: _id, updatedAt: _u, ...s } = await getSettings();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company details printed on every purchase order."
        actions={<Link href="/settings/api-keys" className="btn">API keys</Link>}
      />
      <SettingsForm initial={s} />
    </>
  );
}
