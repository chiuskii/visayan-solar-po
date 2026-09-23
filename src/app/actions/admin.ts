"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { companySettings, users } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth";

export type FormState = { error?: string; ok?: string };

const userSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["ADMIN", "STAFF"]),
  active: z.boolean(),
  password: z.string().max(200),
});

export async function saveUser(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const parsed = userSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    role: formData.get("role") ?? "STAFF",
    active: formData.get("active") === "on",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { password, ...data } = parsed.data;
  if (!id && password.length < 8) return { error: "Password must be at least 8 characters." };
  if (id && password && password.length < 8) return { error: "New password must be at least 8 characters." };
  if (id === me.id && (!data.active || data.role !== "ADMIN")) return { error: "You can’t remove your own admin access." };

  const [dupe] = await db
    .select({ id: users.id })
    .from(users)
    .where(id ? and(eq(users.email, data.email), ne(users.id, id)) : eq(users.email, data.email))
    .limit(1);
  if (dupe) return { error: "Another user already has that email." };

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  if (id) {
    await db.update(users).set({ ...data, ...(passwordHash ? { passwordHash } : {}) }).where(eq(users.id, id));
  } else {
    await db.insert(users).values({ ...data, passwordHash: passwordHash! });
  }
  revalidatePath("/users");
  redirect("/users");
}

export async function changeMyPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "The new passwords don’t match." };
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, me.id));
  if (!row || !(await bcrypt.compare(current, row.hash))) return { error: "Your current password is incorrect." };
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, me.id));
  return { ok: "Password updated." };
}

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const s = (k: string, max = 500) => {
    const v = String(formData.get(k) ?? "").trim().slice(0, max);
    return v || null;
  };
  const companyName = s("companyName", 190);
  if (!companyName) return { error: "Enter the company name." };
  const poPrefix = (s("poPrefix", 20) ?? "VS-PO").replace(/[^A-Za-z0-9-]/g, "");
  const values = {
    companyName,
    address: s("address", 2000),
    phone: s("phone", 60),
    email: s("email", 190),
    tin: s("tin", 40),
    poPrefix: poPrefix || "VS-PO",
    defaultTerms: s("defaultTerms", 190),
    poFooter: s("poFooter", 2000),
    approverName: s("approverName", 120),
    approverTitle: s("approverTitle", 120),
  };
  await db.insert(companySettings).values({ id: 1, ...values }).onDuplicateKeyUpdate({ set: values });
  revalidatePath("/settings");
  return { ok: "Settings saved." };
}
