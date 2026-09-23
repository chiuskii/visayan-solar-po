import { PasswordForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} · ${user.email}`} />
      <PasswordForm />
    </>
  );
}
