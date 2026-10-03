"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, query, transaction } from "@/db";
import { toRow } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { round2 } from "@/lib/po";

export type FormState = { error?: string };

const itemSchema = z.object({
  supplierId: z.number().int().positive().nullable(),
  materialId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Each line needs a material/description.").max(255),
  spec: z.string().trim().max(190).optional().default(""),
  unit: z.string().trim().min(1, "Each line needs a unit.").max(30),
  quantity: z.number().positive("Quantity must be more than 0."),
  unitCost: z.number().min(0, "Unit cost can’t be negative."),
});

const bundleSchema = z.object({
  name: z.string().trim().min(1, "Give the bundle a name.").max(190),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null),
  items: z.array(itemSchema).min(1, "Add at least one material line."),
});

const key = (name: string, spec: string | null) => `${name.trim().toLowerCase()}|${(spec ?? "").trim().toLowerCase()}`;

/**
 * Saves a bundle and replaces its lines. With `addToMaterials=on`, lines that aren't linked
 * to a material are matched to one by name + spec, or added to the Materials list.
 */
export async function saveBundle(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = [];
  }
  const parsed = bundleSchema.safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "", items });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { name, description } = parsed.data;
  const lines = parsed.data.items.map((it, i) => ({
    ...it,
    spec: it.spec || null,
    materialId: it.materialId ?? null,
    quantity: round2(it.quantity),
    unitCost: round2(it.unitCost),
    sortOrder: i,
  }));

  const supplierIds = [...new Set(lines.map((l) => l.supplierId).filter((v): v is number => v !== null))];
  if (supplierIds.length) {
    const found = await query<{ id: number }>("SELECT id FROM suppliers WHERE id IN (?)", [supplierIds]);
    if (found.length !== supplierIds.length) return { error: "One of the chosen suppliers no longer exists. Pick another." };
  }
  if (id && !(await query("SELECT id FROM bundles WHERE id = ?", [id])).length) return { error: "This bundle no longer exists." };
  const addToMaterials = formData.get("addToMaterials") === "on";

  const bundleId = await transaction(async (conn) => {
    if (addToMaterials) {
      const existing = new Map<string, number>();
      for (const m of await query<{ id: number; name: string; spec: string | null }>("SELECT id, name, spec FROM materials", [], conn)) {
        existing.set(key(m.name, m.spec), m.id);
      }
      for (const l of lines) {
        if (l.materialId) continue;
        const k = key(l.description, l.spec);
        let mid = existing.get(k);
        if (!mid) {
          const res = await execute(
            "INSERT INTO materials SET ?",
            [toRow("materials", { name: l.description, spec: l.spec, unit: l.unit, defaultCost: l.unitCost, defaultSupplierId: l.supplierId })],
            conn,
          );
          mid = res.insertId;
          existing.set(k, mid);
        }
        l.materialId = mid;
      }
    }
    let bid = id;
    if (bid) {
      await execute("UPDATE bundles SET ? WHERE id = ?", [toRow("bundles", { name, description }), bid], conn);
      await execute("DELETE FROM bundle_items WHERE bundle_id = ?", [bid], conn);
    } else {
      bid = (await execute("INSERT INTO bundles SET ?", [toRow("bundles", { name, description })], conn)).insertId;
    }
    await execute(
      "INSERT INTO bundle_items (bundle_id, supplier_id, material_id, description, spec, unit, quantity, unit_cost, sort_order) VALUES ?",
      [lines.map((l) => [bid, l.supplierId, l.materialId, l.description, l.spec, l.unit, l.quantity, l.unitCost, l.sortOrder])],
      conn,
    );
    return bid;
  });
  revalidatePath("/bundles");
  if (addToMaterials) revalidatePath("/materials");
  redirect(`/bundles?saved=${bundleId}`);
}

export async function deleteBundle(id: number, _fd: FormData) {
  await requireUser();
  await execute("DELETE FROM bundles WHERE id = ?", [id]);
  revalidatePath("/bundles");
  redirect("/bundles");
}

/** Adds suppliers by name (skipping ones that already exist) and returns all of them with ids. */
export async function addSuppliersByName(names: string[]): Promise<{ id: number; name: string }[]> {
  await requireUser();
  const wanted = new Map<string, string>();
  for (const n of names.slice(0, 200)) {
    const t = String(n).trim().slice(0, 190);
    if (t) wanted.set(t.toLowerCase(), t);
  }
  if (wanted.size === 0) return [];
  const existing = await query<{ id: number; name: string }>("SELECT id, name FROM suppliers");
  const have = new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));
  const result: { id: number; name: string }[] = [];
  for (const [k, name] of wanted) {
    const found = have.get(k);
    if (found) result.push(found);
    else result.push({ id: (await execute("INSERT INTO suppliers SET name = ?", [name])).insertId, name });
  }
  revalidatePath("/suppliers");
  return result;
}
