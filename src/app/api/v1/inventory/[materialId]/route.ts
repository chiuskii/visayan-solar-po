import { queryOne } from "@/db";
import { cols, type Material } from "@/db/types";
import { ApiError, apiRoute, idParam } from "@/lib/api-keys";
import { materialLedger, stockStatus } from "@/lib/inventory";

export const dynamic = "force-dynamic";

/** One material's stock on hand and its movements (newest first, with the balance after each). */
export const GET = apiRoute<{ params: Promise<{ materialId: string }> }>("inventory", "READ", async (_req, _c, ctx) => {
  const id = idParam((await ctx.params).materialId);
  const material = await queryOne<Material>(`SELECT ${cols("materials")} FROM materials WHERE id = ?`, [id]);
  if (!material) throw new ApiError(404, "Material not found.");
  const movements = await materialLedger(id);
  const onHand = movements[0]?.balance ?? 0;
  return { data: { material, onHand, status: stockStatus({ onHand, reorderLevel: material.reorderLevel }), movements } };
});
