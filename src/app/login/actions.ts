"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { execute, queryOne } from "@/db";
import { cols, type User } from "@/db/types";
import { createSession, destroySession } from "@/lib/auth";
import { clearFailures, clientIp, failureMessage, lockMinutesLeft, lockedMessage, recordFailure } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!email || !password) return { error: "Enter your email and password." };

  // Rate limit by IP: a locked-out address isn't checked at all.
  const ip = await clientIp();
  const locked = await lockMinutesLeft(ip);
  if (locked) return { error: lockedMessage(locked) };

  const user = await queryOne<User>(`SELECT ${cols("users")} FROM users WHERE email = ?`, [email]);
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return { error: failureMessage("Email or password is incorrect.", await recordFailure(ip)) };
  await clearFailures(ip);

  await createSession({ id: user.id, name: user.name, email: user.email, role: user.role, canApprove: user.canApprove });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

/**
 * Change password from the sign-in page (no session needed): checks the email and current
 * password like a sign-in, then sets the new one.
 */
export async function changePasswordFromLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!email || !current) return { error: "Enter your email and current password." };
  if (next.length < 8) return { error: "The new password must be at least 8 characters." };
  if (next.length > 200) return { error: "That password is too long." };
  if (next !== confirm) return { error: "The two new passwords don’t match." };
  if (next === current) return { error: "The new password must be different from the current one." };

  // Same IP rate limit as sign-in: this form also checks a password.
  const ip = await clientIp();
  const locked = await lockMinutesLeft(ip);
  if (locked) return { error: lockedMessage(locked) };

  const user = await queryOne<Pick<User, "id" | "passwordHash" | "active">>(
    "SELECT id, password_hash AS passwordHash, active FROM users WHERE email = ?",
    [email],
  );
  const ok = user && user.active && (await bcrypt.compare(current, user.passwordHash));
  if (!ok) return { error: failureMessage("Email or current password is incorrect.", await recordFailure(ip)) };
  await clearFailures(ip);

  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(next, 10), user.id]);
  redirect("/login?changed=1");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
