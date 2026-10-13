import { queryOne } from "@/db";
import { ApiError, apiRoute } from "@/lib/api-keys";
import { getPoDetail } from "@/lib/po-queries";

export const dynamic = "force-dynamic";

/** One PO by id or PO number, with its lines, per-supplier totals and deliveries. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>("purchase_orders", "READ", async (_req, _c, ctx) => {
  const ref = decodeURIComponent((await ctx.params).id);
  const id = /^\d+$/.test(ref) ? Number(ref) : (await queryOne<{ id: number }>("SELECT id FROM purchase_orders WHERE po_number = ?", [ref]))?.id;
  const d = id ? await getPoDetail(id) : null;
  if (!d) throw new ApiError(404, "Purchase order not found.");
  return {
    data: {
      ...d.po,
      client: d.client,
      createdByName: d.createdByName,
      approvedByName: d.approvedByName,
      items: d.items,
      totals: d.totals,
      bySupplier: d.bySupplier.map((g) => ({ supplier: g.supplier, totals: g.totals, itemIds: g.items.map((i) => i.id) })),
      deliveries: d.deliveries,
    },
  };
});
