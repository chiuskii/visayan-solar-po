import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./session-token";

export type CurrentUser = { id: number; name: string; email: string; role: "ADMIN" | "STAFF" };

export async function createSession(user: CurrentUser) {
  const token = await signSession({ userId: user.id, role: user.role, name: user.name });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, re-checked against the database (so disabled accounts lose access). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/?denied=1");
  return user;
}
