import { issueStock } from "@/app/actions/inventory";
import { IssueForm } from "@/components/inventory-forms";
import { PageHeader } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayPH } from "@/lib/format";
import { listBundles } from "@/lib/bundles";
import { listStock } from "@/lib/inventory";

export const metadata = { title: "Issue materials" };

export default async function IssuePage() {
  await requireUser();
  const [stock, clients, bundleRows] = await Promise.all([
    listStock(),
    query<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY name"),
    listBundles(),
  ]);
  const bundles = bundleRows.map((b) => ({ id: b.id, name: b.name, items: b.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })) }));
  return (
    <>
      <PageHeader title="Issue materials" subtitle="Take materials out of stock for a client or project." back={{ href: "/inventory", label: "Inventory" }} />
      <IssueForm action={issueStock} materials={stock} clients={clients} bundles={bundles} today={todayPH()} />
    </>
  );
}
