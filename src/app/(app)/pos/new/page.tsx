import { listForPicker } from "@/app/actions/masters";
import { createPo } from "@/app/actions/pos";
import { PoForm } from "@/components/po-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayPH } from "@/lib/format";
import { getSettings } from "@/lib/po";

export const metadata = { title: "New PO" };

export default async function NewPoPage() {
  const [user, opts, settings] = await Promise.all([requireUser(), listForPicker(), getSettings()]);
  return (
    <>
      <PageHeader title="New purchase order" subtitle="The PO number is assigned when you save." back={{ href: "/pos", label: "Purchase Orders" }} />
      <PoForm
        action={createPo}
        isEdit={false}
        cancelHref="/pos"
        requireApproval={settings.requireApproval && user.role !== "ADMIN"}
        suppliers={opts.suppliers}
        materials={opts.materials}
        bundles={opts.bundles}
        initial={{
          // Orders go to the warehouse by default; materials are assigned to clients from Inventory.
          toWarehouse: true,
          poDate: todayPH(),
          expectedDate: "",
          deliveryAddress: settings.address ?? "",
          terms: settings.defaultTerms ?? "",
          notes: "",
          vatRate: 0,
          discount: 0,
          items: [],
        }}
      />
    </>
  );
}
