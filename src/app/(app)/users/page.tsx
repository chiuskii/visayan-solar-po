import { asc } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requireAdmin();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .orderBy(asc(users.name));
  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in to the PO system." actions={<Link href="/users/new" className="btn btn-primary">+ New user</Link>} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><Link className="font-medium text-brand-700 hover:underline" href={`/users/${u.id}`}>{u.name}</Link></td>
                <td>{u.email}</td>
                <td>{u.role === "ADMIN" ? "Admin" : "Staff"}</td>
                <td>{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-slate-400">Disabled</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
