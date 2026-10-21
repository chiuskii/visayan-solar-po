import { notFound, redirect } from "next/navigation";
import { addToJobOrder } from "@/app/actions/inventory";
import { IssueForm } from "@/components/inventory-forms";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listBundles } from "@/lib/bundles";
import { todayPH } from "@/lib/format";
import { listStock } from "@/lib/inventory";
import { getJobOrder } from "@/lib/job-orders";

export const metadata = { title: "Add materials" };

export default async function AddToJobOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [jo, stock, bundleRows] = await Promise.all([getJobOrder(id), listStock(), listBundles()]);
  if (!jo) notFound();
  if (jo.status === "CANCELLED") redirect(`/inventory/job-orders/${id}`);
  const bundles = bundleRows.map((b) => ({ id: b.id, name: b.name, items: b.items.map((i) => ({ materialId: i.materialId, quantity: i.quantity })) }));
  return (
    <>
      <PageHeader
        title={`Add materials to ${jo.joNumber}`}
        subtitle="Takes them out of warehouse stock and adds them to this job order."
        back={{ href: `/inventory/job-orders/${id}`, label: jo.joNumber }}
      />
      <IssueForm
        action={addToJobOrder.bind(null, id)}
        materials={stock}
        clients={[]}
        bundles={bundles}
        today={todayPH()}
        addTo={{ id, joNumber: jo.joNumber, clientName: jo.client?.name ?? null }}
      />
    </>
  );
}
