import { PasswordForm, SignatureForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { queryOne } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  const row = await queryOne<{ signature: string | null }>("SELECT signature FROM users WHERE id = ?", [user.id]);
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.email}`} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SignatureForm initial={row?.signature ?? null} />
        <PasswordForm />
      </div>
    </>
  );
}
