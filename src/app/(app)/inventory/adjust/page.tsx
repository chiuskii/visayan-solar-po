import { adjustStock } from "@/app/actions/inventory";
import { AdjustForm } from "@/components/inventory-forms";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayPH } from "@/lib/format";
import { listStock } from "@/lib/inventory";

export const metadata = { title: "Adjust stock" };

export default async function AdjustPage({ searchParams }: { searchParams: Promise<{ material?: string }> }) {
  await requireUser();
  const { material } = await searchParams;
  const stock = await listStock();
  return (
    <>
      <PageHeader
        title="Adjust stock"
        subtitle="For physical counts, opening stock, damage or corrections."
        back={{ href: "/inventory", label: "Inventory" }}
      />
      <AdjustForm action={adjustStock} materials={stock} initialMaterialId={Number(material) || undefined} today={todayPH()} />
    </>
  );
}
