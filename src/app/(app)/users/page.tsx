import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { query } from "@/db";
import type { User } from "@/db/types";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ removed?: string }> }) {
  await requireAdmin();
  const { removed } = await searchParams;
  const rows = await query<Pick<User, "id" | "name" | "designation" | "email" | "role" | "canApprove" | "active"> & { hasSignature: boolean }>(
    `SELECT id, name, designation, email, role, can_approve AS canApprove, active, signature IS NOT NULL AS hasSignature
     FROM users ORDER BY name`,
  );
  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in to the PO system." actions={<Link href="/users/new" className="btn btn-primary">+ New user</Link>} />
      {removed && <p className="ok-box mb-4">User removed.</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Designation</th><th>Email</th><th>Role</th><th>Approver</th><th>E-signature</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><Link className="font-medium text-brand-700 hover:underline" href={`/users/${u.id}`}>{u.name}</Link></td>
                <td>{u.designation ?? "—"}</td>
                <td>{u.email}</td>
                <td>{u.role === "ADMIN" ? "Admin" : "Staff"}</td>
                <td>{u.canApprove ? <span className="font-medium text-violet-700">Approver</span> : "—"}</td>
                <td>{Number(u.hasSignature) ? "✓" : <span className="text-slate-400">None</span>}</td>
                <td>{u.active ? <span className="text-emerald-700">Active</span> : <span className="text-slate-400">Disabled</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <Link className="text-sm text-brand-700 hover:underline" href={`/users/${u.id}#password`}>Change password</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
