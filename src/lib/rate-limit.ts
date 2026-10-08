import "server-only";
import { headers } from "next/headers";
import { execute, queryOne } from "@/db";

// Sign-in rate limiting by client IP address. Settings (environment, optional):
//   LOGIN_MAX_ATTEMPTS  failed attempts allowed per IP within the window (default 5)
//   LOGIN_LOCK_MINUTES  window length and lockout length, in minutes (default 15)
//   TRUSTED_PROXY_HOPS  reverse proxies in front of the app that append to X-Forwarded-For (default 0)
const MAX_ATTEMPTS = Math.max(1, Number(process.env.LOGIN_MAX_ATTEMPTS) || 5);
const LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES) || 15);
const PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS) || 0);

/**
 * The client's IP. Next.js fills X-Forwarded-For with the connection address when the request has
 * none; each trusted reverse proxy appends the address it received the request from. So the real
 * client is the entry PROXY_HOPS from the end (the last entry when there's no proxy). Entries further
 * left were sent by the client and can't be trusted.
 */
export async function clientIp() {
  const h = await headers();
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const raw = chain[Math.max(0, chain.length - Math.max(PROXY_HOPS, 1))] ?? h.get("x-real-ip") ?? "unknown";
  // "::ffff:192.168.1.5" → "192.168.1.5"
  return raw.replace(/^::ffff:/i, "").slice(0, 64);
}

/** Minutes left on a lockout for this IP, or 0 if it may try to sign in. */
export async function lockMinutesLeft(ip: string) {
  const row = await queryOne<{ secs: number | null }>(
    "SELECT TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS secs FROM login_throttle WHERE ip = ? AND locked_until > NOW()",
    [ip],
  );
  return row?.secs ? Math.max(1, Math.ceil(Number(row.secs) / 60)) : 0;
}

/**
 * Counts a failed attempt and returns how many are left before the IP is locked out (0 = now locked).
 * One atomic upsert: a new window starts once the old one has expired, and reaching the limit sets
 * the lock. (MySQL applies the SET list left to right, so `locked_until` sees the new `failures`.)
 */
export async function recordFailure(ip: string) {
  await execute(
    `INSERT INTO login_throttle (ip, failures, window_started_at) VALUES (?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       failures = IF(window_started_at < NOW() - INTERVAL ? MINUTE, 1, failures + 1),
       window_started_at = IF(window_started_at < NOW() - INTERVAL ? MINUTE, NOW(), window_started_at),
       locked_until = IF(failures >= ?, NOW() + INTERVAL ? MINUTE, locked_until)`,
    [ip, LOCK_MINUTES, LOCK_MINUTES, MAX_ATTEMPTS, LOCK_MINUTES],
  );
  // Now and then, forget IPs that haven't been seen for a day.
  if (Math.random() < 0.02) await execute("DELETE FROM login_throttle WHERE updated_at < NOW() - INTERVAL 1 DAY");
  const row = await queryOne<{ failures: number }>("SELECT failures FROM login_throttle WHERE ip = ?", [ip]);
  return Math.max(0, MAX_ATTEMPTS - Number(row?.failures ?? 0));
}

/** A successful sign-in clears the IP's failed attempts. */
export async function clearFailures(ip: string) {
  await execute("DELETE FROM login_throttle WHERE ip = ?", [ip]);
}

export const lockedMessage = (minutes: number) =>
  `Too many failed attempts from your network. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;

/** Message after a failed attempt: the usual error, with a warning once few attempts remain. */
export function failureMessage(base: string, left: number) {
  if (left === 0) return lockedMessage(LOCK_MINUTES);
  if (left <= 2) {
    return `${base} ${left} attempt${left === 1 ? "" : "s"} left before sign-in is paused for ${LOCK_MINUTES} minute${LOCK_MINUTES === 1 ? "" : "s"}.`;
  }
  return base;
}
