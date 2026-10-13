import { ApiError, apiRoute, idParam } from "@/lib/api-keys";
import { getBundle } from "@/lib/bundles";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ params: Promise<{ id: string }> }>("bundles", "READ", async (_req, _c, ctx) => {
  const bundle = await getBundle(idParam((await ctx.params).id));
  if (!bundle) throw new ApiError(404, "Bundle not found.");
  return { data: bundle };
});
