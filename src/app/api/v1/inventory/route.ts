import { ApiError, apiRoute } from "@/lib/api-keys";
import { listStock, stockStatus } from "@/lib/inventory";

export const dynamic = "force-dynamic";

/** Stock on hand per material. ?search= ?filter=all|stock|low */
export const GET = apiRoute("inventory", "READ", async (req) => {
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  if (filter !== "all" && filter !== "stock" && filter !== "low") throw new ApiError(400, "'filter' must be all, stock or low.");
  const rows = await listStock(url.searchParams.get("search")?.trim() ?? "", filter);
  return { data: rows.map((r) => ({ ...r, status: stockStatus(r) })) };
});
