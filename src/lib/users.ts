import "server-only";
import { queryOne } from "@/db";

/** Counts of records a user's name appears on (POs prepared/approved, deliveries, stock movements). */
export async function userHistory(id: number) {
  const row = await queryOne<{ prepared: number; approved: number; deliveries: number; stock: number }>(
    `SELECT (SELECT COUNT(*) FROM purchase_orders WHERE created_by_id = ?) AS prepared,
            (SELECT COUNT(*) FROM purchase_orders WHERE approved_by_id = ?) AS approved,
            (SELECT COUNT(*) FROM deliveries WHERE created_by_id = ?) AS deliveries,
            (SELECT COUNT(*) FROM stock_movements WHERE created_by_id = ?) AS stock`,
    [id, id, id, id],
  );
  return {
    prepared: Number(row?.prepared ?? 0),
    approved: Number(row?.approved ?? 0),
    deliveries: Number(row?.deliveries ?? 0),
    stock: Number(row?.stock ?? 0),
  };
}

export const historyTotal = (h: Awaited<ReturnType<typeof userHistory>>) => h.prepared + h.approved + h.deliveries + h.stock;
