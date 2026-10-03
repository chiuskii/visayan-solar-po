import { NavLinks } from "@/components/nav";
import { queryOne } from "@/db";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const me = await queryOne<{ designation: string | null }>("SELECT designation FROM users WHERE id = ?", [user.id]);
  const items = [
    { href: "/", label: "Dashboard" },
    { href: "/pos", label: "Purchase Orders" },
    { href: "/clients", label: "Clients" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/materials", label: "Materials" },
    { href: "/bundles", label: "Bundles" },
    { href: "/inventory", label: "Inventory" },
    ...(user.role === "ADMIN"
      ? [
          { href: "/users", label: "Users" },
          { href: "/settings", label: "Settings" },
        ]
      : []),
  ];
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-brand-900 text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:justify-between">
        <div className="p-4">
          <div className="mb-4 flex items-center gap-3 px-3">
            <img src="/logo.png" alt="Visayan Solar" className="h-12 w-auto shrink-0" />
            <div>
              <div className="text-xs font-semibold tracking-widest text-sun-400 uppercase">Visayan Solar</div>
              <div className="text-base font-semibold">PO System</div>
            </div>
          </div>
          <NavLinks items={items} />
        </div>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="px-3 font-medium">{user.name}</div>
          <div className="px-3 text-xs text-brand-100">
            {[me?.designation, user.role === "ADMIN" ? "Admin" : "Staff", user.canApprove ? "Approver" : null].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-2 flex gap-2 px-3">
            <a href="/account" className="text-xs text-brand-100 hover:underline">My account</a>
            <form action={logout}>
              <button className="text-xs text-brand-100 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
