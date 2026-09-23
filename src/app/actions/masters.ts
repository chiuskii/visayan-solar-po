"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients, materials, purchaseOrders, suppliers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MASTERS, type MasterKey } from "@/lib/masters";

const TABLES = { clients, suppliers, materials } as const;

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
    await db.update(table).set(values as never).where(eq(table.id, id));
  } else {
    await db.insert(table).values(values as never);
  }
  revalidatePath(`/${entity}`);
  redirect(`/${entity}`);
}

export async function deleteMaster(entity: MasterKey, id: number, _formData: FormData) {
  await requireUser();
  const table = TABLES[entity];
  if (entity === "clients" || entity === "suppliers") {
    const col = entity === "clients" ? purchaseOrders.clientId : purchaseOrders.supplierId;
    const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(purchaseOrders).where(eq(col, id));
    if (Number(row?.n) > 0) redirect(`/${entity}/${id}?error=in-use`);
  }
  await db.delete(table).where(eq(table.id, id));
  revalidatePath(`/${entity}`);
  redirect(`/${entity}`);
}

export async function listForPicker() {
  await requireUser();
  const [c, s, m] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, address: clients.address }).from(clients).orderBy(asc(clients.name)),
    db
      .select({ id: suppliers.id, name: suppliers.name, paymentTerms: suppliers.paymentTerms })
      .from(suppliers)
      .orderBy(asc(suppliers.name)),
    db
      .select({ id: materials.id, name: materials.name, spec: materials.spec, unit: materials.unit, defaultCost: materials.defaultCost })
      .from(materials)
      .orderBy(asc(materials.name), asc(materials.spec)),
  ]);
  return { clients: c, suppliers: s, materials: m };
}
