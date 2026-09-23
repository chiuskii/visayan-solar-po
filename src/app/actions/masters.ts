"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { execute, query, queryOne } from "@/db";
import { toRow, type Client, type Material, type Supplier } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { MASTERS, type MasterKey } from "@/lib/masters";

const TABLES = { clients: "clients", suppliers: "suppliers", materials: "materials" } as const;

export type FormState = { error?: string };

function readFields(entity: MasterKey, formData: FormData) {
  const values: Record<string, string | number | null> = {};
  for (const f of MASTERS[entity].fields) {
    const raw = String(formData.get(f.name) ?? "").trim();
    if (f.required && !raw) throw new Error(`${f.label} is required.`);
    if (f.type === "number") {
      const n = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label} must be a positive number.`);
      values[f.name] = n;
    } else {
      if (raw.length > 2000) throw new Error(`${f.label} is too long.`);
      values[f.name] = raw || null;
    }
  }
  return values;
}

export async function saveMaster(entity: MasterKey, id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!(entity in TABLES)) return { error: "Unknown list." };
  let values;
  try {
    values = readFields(entity, formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const table = TABLES[entity];
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
    const col = entity === "clients" ? "client_id" : "supplier_id";
    const row = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM purchase_orders WHERE ${col} = ?`, [id]);
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
    query<Pick<Material, "id" | "name" | "spec" | "unit" | "defaultCost">>(
      "SELECT id, name, spec, unit, default_cost AS defaultCost FROM materials ORDER BY name, spec",
    ),
  ]);
  return { clients: c, suppliers: s, materials: m };
}
