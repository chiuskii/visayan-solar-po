import { listForPicker } from "@/app/actions/masters";
import { createPo } from "@/app/actions/pos";
import { PoForm } from "@/components/po-form";
import { PageHeader } from "@/components/ui";
import { todayPH } from "@/lib/format";
import { getSettings } from "@/lib/po";

export const metadata = { title: "New PO" };

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const [opts, settings] = await Promise.all([listForPicker(), getSettings()]);
  const clientId = opts.clients.find((c) => c.id === Number(client))?.id ?? "";
  return (
    <>
      <PageHeader title="New purchase order" subtitle="The PO number is assigned when you save." back={{ href: "/pos", label: "Purchase Orders" }} />
      <PoForm
        action={createPo}
        isEdit={false}
        cancelHref="/pos"
        clients={opts.clients}
        suppliers={opts.suppliers}
        materials={opts.materials}
        initial={{
          clientId,
          supplierId: "",
          poDate: todayPH(),
          expectedDate: "",
          deliveryAddress: opts.clients.find((c) => c.id === clientId)?.address ?? "",
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
