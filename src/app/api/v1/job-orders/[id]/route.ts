import { queryOne } from "@/db";
import { ApiError, apiRoute } from "@/lib/api-keys";
import { getJobOrder } from "@/lib/job-orders";

export const dynamic = "force-dynamic";

/** One job order by id or JO number, with its client and materials. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>("job_orders", "READ", async (_req, _c, ctx) => {
  const ref = decodeURIComponent((await ctx.params).id);
  const id = /^\d+$/.test(ref) ? Number(ref) : (await queryOne<{ id: number }>("SELECT id FROM job_orders WHERE jo_number = ?", [ref]))?.id;
  const jo = id ? await getJobOrder(id) : null;
  if (!jo) throw new ApiError(404, "Job order not found.");
  return { data: jo };
});
