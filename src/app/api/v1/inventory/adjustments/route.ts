import { z } from "zod";
import { ApiError, apiRoute, jsonBody } from "@/lib/api-keys";
import { onHandByMaterial, recordAdjustment } from "@/lib/inventory";

export const dynamic = "force-dynamic";

const schema = z.object({
  materialId: z.number().int().positive(),
  mode: z.enum(["set", "change"]),
  quantity: z.number().refine(Number.isFinite),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be like 2026-01-31").optional(),
  notes: z.string().trim().min(1, "notes is required (the reason for the adjustment)").max(1900),
});

/**
 * Records a stock adjustment. Body: { materialId, mode: "set" (a count) | "change" (+/- amount), quantity, notes, date? }.
 * The movement is noted as made through this API key.
 */
export const POST = apiRoute("inventory", "WRITE", async (req, caller) => {
  const parsed = schema.safeParse(await jsonBody(req));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new ApiError(400, `${i?.path.join(".") || "body"}: ${i?.message}`);
  }
  const { materialId, mode, quantity, notes } = parsed.data;
  const date = parsed.data.date ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const error = await recordAdjustment({ materialId, mode, quantity, movementDate: date, notes: `${notes} [API: ${caller.name}]`, createdById: null });
  if (error) throw new ApiError(error.includes("no longer exists") ? 404 : 400, error);
  const onHand = (await onHandByMaterial([materialId])).get(materialId) ?? 0;
  return Response.json({ data: { materialId, onHand } }, { status: 201 });
});
