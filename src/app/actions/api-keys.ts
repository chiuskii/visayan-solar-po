"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { execute, queryOne } from "@/db";
import { toRow } from "@/db/types";
import { generateApiKey, readPermissions, savePermissions } from "@/lib/api-keys";
import { requireAdmin } from "@/lib/auth";

/** `key` is the new key, returned once after it's created. */
export type ApiKeyFormState = { error?: string; ok?: string; key?: string };

const keySchema = z.object({
  name: z.string().trim().min(1, "Give the key a name (e.g. the system that will use it).").max(120),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null),
  expiresAt: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid expiry date.")])
    .transform((v) => v || null),
});

function readForm(formData: FormData) {
  const parsed = keySchema.safeParse({
    name: formData.get("name") ?? "",
    notes: formData.get("notes") ?? "",
    expiresAt: formData.get("expiresAt") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." } as const;
  const permissions = readPermissions((n) => formData.get(n));
  if (Object.keys(permissions).length === 0) return { error: "Give the key access to at least one feature." } as const;
  return { values: parsed.data, permissions } as const;
}

export async function createApiKey(_prev: ApiKeyFormState, formData: FormData): Promise<ApiKeyFormState> {
  const me = await requireAdmin();
  const form = readForm(formData);
  if ("error" in form) return { error: form.error };
  const { key, keyPrefix, keyHash } = generateApiKey();
  const res = await execute("INSERT INTO api_keys SET ?", [toRow("api_keys", { ...form.values, keyPrefix, keyHash, createdById: me.id })]);
  await savePermissions(res.insertId, form.permissions);
  revalidatePath("/settings/api-keys");
  return { ok: "API key created.", key };
}

export async function updateApiKey(id: number, _prev: ApiKeyFormState, formData: FormData): Promise<ApiKeyFormState> {
  await requireAdmin();
  const form = readForm(formData);
  if ("error" in form) return { error: form.error };
  const active = formData.get("active") === "on";
  const res = await execute("UPDATE api_keys SET ? WHERE id = ?", [toRow("api_keys", { ...form.values, active }), id]);
  if (!res.affectedRows) return { error: "This key no longer exists." };
  await savePermissions(id, form.permissions);
  revalidatePath("/settings/api-keys");
  redirect("/settings/api-keys?saved=1");
}

/** Turns a key off or back on from the list. */
export async function setApiKeyActive(id: number, active: boolean, _fd: FormData) {
  await requireAdmin();
  await execute("UPDATE api_keys SET active = ? WHERE id = ?", [active, id]);
  revalidatePath("/settings/api-keys");
}

export async function deleteApiKey(id: number, _fd: FormData) {
  await requireAdmin();
  if (await queryOne("SELECT id FROM api_keys WHERE id = ?", [id])) await execute("DELETE FROM api_keys WHERE id = ?", [id]);
  revalidatePath("/settings/api-keys");
  redirect("/settings/api-keys?removed=1");
}
