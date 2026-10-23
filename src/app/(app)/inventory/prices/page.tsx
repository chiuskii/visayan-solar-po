import { saveMaterialPrices } from "@/app/actions/inventory";
import { PriceSheetForm } from "@/components/price-sheet-form";
import { PageHeader } from "@/components/ui";
import { query } from "@/db";
import { requireUser } from "@/lib/auth";
import { listStock } from "@/lib/inventory";

export const metadata = { title: "Edit prices" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireUser();
  const saved = Number((await searchParams).saved) || 0;
  const [stock, lastPo] = await Promise.all([
    listStock(),
    // Each material's price on its newest (not cancelled) PO line, as a guide.
    query<{ materialId: number; unitCost: number }>(
      `SELECT x.material_id AS materialId, x.unit_cost AS unitCost FROM (
         SELECT pi.material_id, pi.unit_cost, ROW_NUMBER() OVER (PARTITION BY pi.material_id ORDER BY po.po_date DESC, pi.id DESC) AS rn
         FROM po_items pi JOIN purchase_orders po ON po.id = pi.po_id
         WHERE pi.material_id IS NOT NULL AND po.status <> 'CANCELLED'
       ) x WHERE x.rn = 1`,
    ),
  ]);
  const poPrice = new Map(lastPo.map((r) => [r.materialId, Number(r.unitCost)]));
  return (
    <>
      <PageHeader
        title="Edit prices"
        subtitle="Each material’s cost, used when it’s assigned to a client from now on. Prices already on clients’ job orders don’t change."
        back={{ href: "/inventory", label: "Inventory" }}
      />
      {saved > 0 && <p className="ok-box mb-4">Saved {saved} price{saved === 1 ? "" : "s"}.</p>}
      <PriceSheetForm
        key={saved ? `saved-${Date.now()}` : "sheet"}
        action={saveMaterialPrices}
        materials={stock.map((m) => ({
          id: m.id, name: m.name, spec: m.spec, category: m.category, unit: m.unit, defaultCost: m.defaultCost, onHand: m.onHand,
          lastPoPrice: poPrice.get(m.id) ?? null,
        }))}
      />
    </>
  );
}
