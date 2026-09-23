import { UserForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New user" back={{ href: "/users", label: "Users" }} />
      <UserForm id={null} />
    </>
  );
}
