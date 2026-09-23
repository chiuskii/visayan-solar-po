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
  if (entity === "clients" || entity === "suppliers") {
    const sql =
      entity === "clients"
        ? "SELECT COUNT(*) AS n FROM purchase_orders WHERE client_id = ?"
        : "SELECT COUNT(*) AS n FROM po_items WHERE supplier_id = ?";
    const row = await queryOne<{ n: number }>(sql, [id]);
    if (Number(row?.n) > 0) redirect(`/${entity}/${id}?error=in-use`);
  }
  await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  revalidatePath(`/${entity}`);
  redirect(`/${entity}`);
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
