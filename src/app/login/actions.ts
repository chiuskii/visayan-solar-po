"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { queryOne } from "@/db";
import { cols, type User } from "@/db/types";
import { createSession, destroySession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!email || !password) return { error: "Enter your email and password." };

  const user = await queryOne<User>(`SELECT ${cols("users")} FROM users WHERE email = ?`, [email]);
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return { error: "Email or password is incorrect." };

  await createSession({ id: user.id, name: user.name, email: user.email, role: user.role });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
