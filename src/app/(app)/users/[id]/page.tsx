import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { UserForm } from "@/components/admin-forms";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [u] = await db
    .select({ name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u) notFound();
  return (
    <>
      <PageHeader title={u.name} subtitle="Edit user" back={{ href: "/users", label: "Users" }} />
      <UserForm id={id} initial={u} />
    </>
  );
}
