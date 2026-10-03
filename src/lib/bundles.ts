import "server-only";
import { query, queryOne } from "@/db";
import { cols, type Bundle, type BundleItem } from "@/db/types";

export type BundleWithItems = Bundle & { items: (BundleItem & { supplierName: string | null })[] };

/** All bundles with their lines, in name order. */
export async function listBundles(): Promise<BundleWithItems[]> {
  const bundles = await query<Bundle>(`SELECT ${cols("bundles")} FROM bundles ORDER BY name, id`);
  if (bundles.length === 0) return [];
  const items = await query<BundleItem & { supplierName: string | null }>(
    `SELECT ${cols("bundle_items", "bi")}, s.name AS supplierName
     FROM bundle_items bi
     LEFT JOIN suppliers s ON s.id = bi.supplier_id
     WHERE bi.bundle_id IN (?)
     ORDER BY bi.sort_order, bi.id`,
    [bundles.map((b) => b.id)],
  );
  return bundles.map((b) => ({ ...b, items: items.filter((i) => i.bundleId === b.id) }));
}

export async function getBundle(id: number): Promise<BundleWithItems | null> {
  const b = await queryOne<Bundle>(`SELECT ${cols("bundles")} FROM bundles WHERE id = ?`, [id]);
  if (!b) return null;
  const items = await query<BundleItem & { supplierName: string | null }>(
    `SELECT ${cols("bundle_items", "bi")}, s.name AS supplierName
     FROM bundle_items bi
     LEFT JOIN suppliers s ON s.id = bi.supplier_id
     WHERE bi.bundle_id = ?
     ORDER BY bi.sort_order, bi.id`,
    [id],
  );
  return { ...b, items };
}
