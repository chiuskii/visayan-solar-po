import { ApiError, apiRoute, paging } from "@/lib/api-keys";
import { listJobOrders } from "@/lib/job-orders";

export const dynamic = "force-dynamic";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Job orders, newest first. Filters: ?client=<id> &status=ISSUED|CANCELLED &from= &to= &search=. */
export const GET = apiRoute("job_orders", "READ", async (req) => {
  const url = new URL(req.url);
  const { limit, offset } = paging(url);
  const status = url.searchParams.get("status")?.toUpperCase() || null;
  if (status && status !== "ISSUED" && status !== "CANCELLED") throw new ApiError(400, "'status' must be ISSUED or CANCELLED.");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if ((from && !isDate(from)) || (to && !isDate(to))) throw new ApiError(400, "Dates must be like 2026-01-31.");
  const { rows, total } = await listJobOrders({
    clientId: Number(url.searchParams.get("client")) || null,
    status: status as "ISSUED" | "CANCELLED" | null,
    search: url.searchParams.get("search")?.trim() ?? "",
    from,
    to,
    limit,
    offset,
  });
  return { data: rows, total, limit, offset };
});
