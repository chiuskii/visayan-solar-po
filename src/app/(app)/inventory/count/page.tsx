import { saveStockCount } from "@/app/actions/inventory";
import { StockCountForm } from "@/components/stock-count-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayPH } from "@/lib/format";
import { listStock } from "@/lib/inventory";

export const metadata = { title: "Stock count" };

export default async function StockCountPage({ searchParams }: { searchParams: Promise<{ counted?: string; adjusted?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const counted = Number(sp.counted) || 0;
  const adjusted = Number(sp.adjusted) || 0;
  const stock = await listStock();
  return (
    <>
      <PageHeader
        title="Stock count"
        subtitle="Count what’s on the shelves. Each counted material is set to the count; the difference is recorded as an adjustment."
        back={{ href: "/inventory", label: "Inventory" }}
      />
      {counted > 0 && (
        <p className="ok-box mb-4">
          Count saved: {counted} material{counted === 1 ? "" : "s"} counted, {adjusted} adjusted, {counted - adjusted} already matched.
        </p>
      )}
      <StockCountForm
        action={saveStockCount}
        materials={stock.map(({ id, name, spec, category, unit, onHand }) => ({ id, name, spec, category, unit, onHand }))}
        today={todayPH()}
        justSaved={counted > 0}
      />
    </>
  );
}
