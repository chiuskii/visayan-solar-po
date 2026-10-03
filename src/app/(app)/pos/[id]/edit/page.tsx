import { notFound, redirect } from "next/navigation";
import { listForPicker } from "@/app/actions/masters";
import { updatePo } from "@/app/actions/pos";
import { PoForm } from "@/components/po-form";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/po";
import { getPoDetail } from "@/lib/po-queries";

export const metadata = { title: "Edit PO" };

export default async function EditPoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [detail, opts, settings] = await Promise.all([getPoDetail(id), listForPicker(), getSettings()]);
  if (!detail) notFound();
  if (detail.po.status === "CANCELLED") redirect(`/pos/${id}`);
  const { po } = detail;
  return (
    <>
      <PageHeader title={`Edit ${po.poNumber}`} back={{ href: `/pos/${id}`, label: po.poNumber }} />
      <PoForm
        action={updatePo.bind(null, id)}
        isEdit
        cancelHref={`/pos/${id}`}
        approvalNotice={
          settings.requireApproval && po.approvedById
            ? `Approved by ${detail.approvedByName ?? "an approver"}. Saving changes withdraws the approval and sends this PO back for approval.`
            : undefined
        }
        clients={opts.clients}
        suppliers={opts.suppliers}
        materials={opts.materials}
        bundles={opts.bundles}
        initial={{
          clientId: po.clientId,
          toWarehouse: po.toWarehouse,
          poDate: po.poDate,
          expectedDate: po.expectedDate ?? "",
          deliveryAddress: po.deliveryAddress ?? "",
          terms: po.terms ?? "",
          notes: po.notes ?? "",
          vatRate: po.vatRate,
          discount: po.discount,
          items: detail.items.map((i) => ({
            key: `e${i.id}`,
            id: i.id,
            supplierId: i.supplierId,
            materialId: i.materialId,
            description: i.description,
            spec: i.spec ?? "",
            unit: i.unit,
            quantity: String(i.quantity),
            unitCost: String(i.unitCost),
            received: i.received,
          })),
        }}
      />
    </>
  );
}
