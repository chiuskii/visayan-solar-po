import { notFound } from "next/navigation";
import { deleteBundle, saveBundle } from "@/app/actions/bundles";
import { listForPicker } from "@/app/actions/masters";
import { BundleForm } from "@/components/bundle-form";
import { ConfirmButton } from "@/components/client-ui";
import { PageHeader } from "@/components/ui";
import { getBundle } from "@/lib/bundles";

export const metadata = { title: "Edit bundle" };

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [bundle, opts] = await Promise.all([getBundle(id), listForPicker()]);
  if (!bundle) notFound();
  return (
    <>
      <PageHeader
        title={bundle.name}
        subtitle="Edit bundle. Changes apply to POs you create from now on — existing POs keep their lines."
        back={{ href: "/bundles", label: "Bundles" }}
        actions={<ConfirmButton action={deleteBundle.bind(null, id)} label="Delete" confirmLabel="Yes, delete bundle" />}
      />
      <BundleForm
        action={saveBundle.bind(null, id)}
        isEdit
        materials={opts.materials}
        suppliers={opts.suppliers}
        initial={{
          name: bundle.name,
          description: bundle.description ?? "",
          items: bundle.items.map((i) => ({
            key: `b${i.id}`,
            supplierId: i.supplierId ?? "",
            materialId: i.materialId,
            description: i.description,
            spec: i.spec ?? "",
            unit: i.unit,
            quantity: String(i.quantity),
            unitCost: String(i.unitCost),
          })),
        }}
      />
    </>
  );
}
