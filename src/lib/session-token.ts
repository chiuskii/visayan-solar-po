// JWT helpers shared by the proxy (route guard) and server code.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "vs_po_session";
export const SESSION_DAYS = 7;

export type SessionPayload = { userId: number; role: "ADMIN" | "STAFF"; name: string };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "number") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
