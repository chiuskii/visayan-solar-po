import { notFound } from "next/navigation";
import { deleteUser, removeUserSignature } from "@/app/actions/admin";
import { SetPasswordForm, UserForm } from "@/components/admin-forms";
import { ConfirmButton } from "@/components/client-ui";
import { PageHeader } from "@/components/ui";
import { queryOne } from "@/db";
import type { User } from "@/db/types";
import { requireAdmin } from "@/lib/auth";
import { historyTotal, userHistory } from "@/lib/users";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const { error, saved } = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const u = await queryOne<Pick<User, "name" | "designation" | "email" | "role" | "canApprove" | "active" | "signature">>(
    "SELECT name, designation, email, role, can_approve AS canApprove, active, signature FROM users WHERE id = ?",
    [id],
  );
  if (!u) notFound();
  const history = await userHistory(id);
  const used = historyTotal(history);
  const usedOn = [
    history.prepared && `prepared ${history.prepared} PO${history.prepared > 1 ? "s" : ""}`,
    history.approved && `approved ${history.approved} PO${history.approved > 1 ? "s" : ""}`,
    history.deliveries && `recorded ${history.deliveries} deliver${history.deliveries > 1 ? "ies" : "y"}`,
    history.stock && `recorded ${history.stock} stock movement${history.stock > 1 ? "s" : ""}`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={u.name} subtitle="Edit user" back={{ href: "/users", label: "Users" }} />
      {saved === "signature-removed" && <p className="ok-box mb-4 max-w-xl">E-signature removed.</p>}
      {error === "self" && <p className="error-box mb-4 max-w-xl">You can’t remove your own account.</p>}
      {error === "has-history" && (
        <p className="error-box mb-4 max-w-xl">This user can’t be removed because their name is on existing records. Disable the account instead.</p>
      )}
      <div className="space-y-6">
        <UserForm id={id} initial={u} />
        <section className="card max-w-xl space-y-3 p-5">
          <h2>E-signature</h2>
          {u.signature ? (
            <>
              <div className="flex h-24 items-center justify-center rounded-md border border-slate-200 bg-white p-2">
                <img src={u.signature} alt={`${u.name}’s e-signature`} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="text-sm text-slate-500">
                Printed on POs {u.name} prepares{u.canApprove ? " or approves" : ""}. Removing it takes it off printed POs; {u.name} can add a new one under My account.
              </p>
              <ConfirmButton action={removeUserSignature.bind(null, id)} label="Remove e-signature" confirmLabel="Yes, remove it" />
            </>
          ) : (
            <p className="text-sm text-slate-500">No e-signature yet. {u.name} can add one under My account.</p>
          )}
        </section>
        <SetPasswordForm id={id} name={u.name} />
        <section className="card max-w-xl space-y-3 border-red-200 p-5">
          <h2>Remove user</h2>
          {id === me.id ? (
            <p className="text-sm text-slate-500">This is your own account, so it can’t be removed here.</p>
          ) : used > 0 ? (
            <p className="text-sm text-slate-600">
              {u.name} has {usedOn.join(", ")}. Their name stays on those records, so the account can’t be removed — untick
              <b> Account active</b> above and save to stop them signing in.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">Permanently removes {u.name}’s account. They won’t be able to sign in.</p>
              <ConfirmButton action={deleteUser.bind(null, id)} label="Remove user" confirmLabel={`Yes, remove ${u.name}`} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
