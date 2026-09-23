"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { execute, query, queryOne } from "@/db";
import { toRow, type Client, type Material, type Supplier } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { readFields } from "@/lib/master-fields";
import { MASTERS, type MasterKey } from "@/lib/masters";

const TABLES = { clients: "clients", suppliers: "suppliers", materials: "materials" } as const;

export type FormState = { error?: string };
export type BulkDeleteResult = { deleted: number; skipped: string[] };

/** Ids (of the given ones) that are used on purchase orders and so can’t be deleted. */
async function idsInUse(entity: MasterKey, ids: number[]) {
  if (entity === "materials" || ids.length === 0) return new Set<number>();
  const sql =
    entity === "clients"
      ? "SELECT DISTINCT client_id AS id FROM purchase_orders WHERE client_id IN (?)"
      : "SELECT DISTINCT supplier_id AS id FROM po_items WHERE supplier_id IN (?)";
  return new Set((await query<{ id: number }>(sql, [ids])).map((r) => r.id));
}

const cleanIds = (ids: unknown[]) => [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);

export async function saveMaster(entity: MasterKey, id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!(entity in TABLES)) return { error: "Unknown list." };
  let values;
  try {
    values = readFields(entity, (name) => String(formData.get(name) ?? ""));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const table = TABLES[entity];
  for (const f of MASTERS[entity].fields) {
    const sid = values[f.name];
    if (f.type === "supplier" && sid !== null && !(await queryOne("SELECT id FROM suppliers WHERE id = ?", [sid]))) {
      return { error: `That ${f.label.toLowerCase()} no longer exists.` };
    }
  }
  if (id) {
    await execute(`UPDATE ${table} SET ? WHERE id = ?`, [toRow(table, values), id]);
  } else {
    await execute(`INSERT INTO ${table} SET ?`, [toRow(table, values)]);
  }
  revalidatePath(`/${entity}`);
  redirect(`/${entity}`);
}

export async function deleteMaster(entity: MasterKey, id: number, _formData: FormData) {
  await requireUser();
  const table = TABLES[entity];
  if (!table) return;
  if ((await idsInUse(entity, [id])).size > 0) redirect(`/${entity}/${id}?error=in-use`);
  await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  revalidatePath(`/${entity}`);
  redirect(`/${entity}`);
}

/** Deletes the selected records, skipping any that are used on purchase orders. */
export async function bulkDeleteMaster(entity: MasterKey, rawIds: number[]): Promise<BulkDeleteResult> {
  await requireUser();
  const table = TABLES[entity];
  if (!table || !MASTERS[entity].bulk) return { deleted: 0, skipped: [] };
  const ids = cleanIds(rawIds);
  if (ids.length === 0) return { deleted: 0, skipped: [] };
  const inUse = await idsInUse(entity, ids);
  const skipped = inUse.size
    ? (await query<{ name: string }>(`SELECT name FROM ${table} WHERE id IN (?) ORDER BY name`, [[...inUse]])).map((r) => r.name)
    : [];
  const toDelete = ids.filter((id) => !inUse.has(id));
  const res = toDelete.length ? await execute(`DELETE FROM ${table} WHERE id IN (?)`, [toDelete]) : { affectedRows: 0 };
  revalidatePath(`/${entity}`);
  return { deleted: res.affectedRows, skipped };
}

/**
 * Sets the ticked fields to the same value on every selected record.
 * The form sends `change_<field>=on` for each field to apply, plus the value itself.
 */
export async function bulkUpdateMaster(entity: MasterKey, rawIds: number[], _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const table = TABLES[entity];
  if (!table || !MASTERS[entity].bulk) return { error: "This list can’t be bulk edited." };
  const ids = cleanIds(rawIds);
  if (ids.length === 0) return { error: "Nothing selected." };
  let values;
  try {
    values = readFields(entity, (name) =>
      name !== "name" && formData.get(`change_${name}`) === "on" ? String(formData.get(name) ?? "") : undefined,
    );
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (Object.keys(values).length === 0) return { error: "Tick at least one field to change." };
  for (const f of MASTERS[entity].fields) {
    const sid = values[f.name];
    if (f.type === "supplier" && sid != null && !(await queryOne("SELECT id FROM suppliers WHERE id = ?", [sid]))) {
      return { error: `That ${f.label.toLowerCase()} no longer exists.` };
    }
  }
  const res = await execute(`UPDATE ${table} SET ? WHERE id IN (?)`, [toRow(table, values), ids]);
  revalidatePath(`/${entity}`);
  redirect(`/${entity}?updated=${res.affectedRows}`);
}

export async function listForPicker() {
  await requireUser();
  const [c, s, m] = await Promise.all([
    query<Pick<Client, "id" | "name" | "address">>("SELECT id, name, address FROM clients ORDER BY name"),
    query<Pick<Supplier, "id" | "name" | "paymentTerms">>("SELECT id, name, payment_terms AS paymentTerms FROM suppliers ORDER BY name"),
    query<Pick<Material, "id" | "name" | "spec" | "unit" | "defaultCost" | "defaultSupplierId">>(
      "SELECT id, name, spec, unit, default_cost AS defaultCost, default_supplier_id AS defaultSupplierId FROM materials ORDER BY name, spec",
    ),
  ]);
  return { clients: c, suppliers: s, materials: m };
}
