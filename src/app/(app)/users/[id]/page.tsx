import { notFound } from "next/navigation";
import { UserForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { queryOne } from "@/db";
import type { User } from "@/db/types";
import { requireAdmin } from "@/lib/auth";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const u = await queryOne<Pick<User, "name" | "email" | "role" | "active">>(
    "SELECT name, email, role, active FROM users WHERE id = ?",
    [id],
  );
  if (!u) notFound();
  return (
    <>
      <PageHeader title={u.name} subtitle="Edit user" back={{ href: "/users", label: "Users" }} />
      <UserForm id={id} initial={u} />
    </>
  );
}
