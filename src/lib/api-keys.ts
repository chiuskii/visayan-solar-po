import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { execute, query, queryOne } from "@/db";
import { API_FEATURES, cols, type ApiAccessLevel, type ApiFeature, type ApiKey } from "@/db/types";
import { clientIp } from "./rate-limit";

/** What each feature's access level allows, shown on the API keys page. `write` is absent where the API is read-only. */
export const FEATURE_INFO: Record<ApiFeature, { label: string; read: string; write?: string }> = {
  purchase_orders: { label: "Purchase orders", read: "List POs and read a PO with its lines, suppliers, totals and deliveries." },
  inventory: { label: "Inventory", read: "Stock on hand per material and each material’s movements.", write: "Record stock adjustments and counts." },
  job_orders: { label: "Job orders", read: "List job orders and read one with its materials." },
  materials: { label: "Materials", read: "List and read materials.", write: "Add and edit materials." },
  suppliers: { label: "Suppliers", read: "List and read suppliers.", write: "Add and edit suppliers." },
  clients: { label: "Clients", read: "List and read clients.", write: "Add and edit clients." },
  bundles: { label: "Bundles", read: "List bundles and their items." },
};

export const KEY_PREFIX = "vsk_";

/** A new random key (shown to the admin once) with the parts that are stored. */
export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, keyPrefix: key.slice(0, 12), keyHash: hashApiKey(key) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

export type Permissions = Partial<Record<ApiFeature, ApiAccessLevel>>;

/** Reads `perm_<feature>` = "" | "READ" | "WRITE" from a form, dropping levels a feature doesn't offer. */
export function readPermissions(get: (name: string) => unknown): Permissions {
  const perms: Permissions = {};
  for (const f of API_FEATURES) {
    const v = String(get(`perm_${f}`) ?? "");
    if (v === "READ" || (v === "WRITE" && FEATURE_INFO[f].write)) perms[f] = v;
  }
  return perms;
}

export async function savePermissions(apiKeyId: number, perms: Permissions) {
  await execute("DELETE FROM api_key_permissions WHERE api_key_id = ?", [apiKeyId]);
  const rows = Object.entries(perms).map(([feature, level]) => [apiKeyId, feature, level]);
  if (rows.length) await execute("INSERT INTO api_key_permissions (api_key_id, feature, access_level) VALUES ?", [rows]);
}

async function permissionsFor(ids: number[]) {
  const map = new Map<number, Permissions>();
  if (!ids.length) return map;
  const rows = await query<{ apiKeyId: number; feature: ApiFeature; accessLevel: ApiAccessLevel }>(
    "SELECT api_key_id AS apiKeyId, feature, access_level AS accessLevel FROM api_key_permissions WHERE api_key_id IN (?)",
    [ids],
  );
  for (const r of rows) map.set(r.apiKeyId, { ...map.get(r.apiKeyId), [r.feature]: r.accessLevel });
  return map;
}

export type ApiKeyRow = Omit<ApiKey, "keyHash"> & { createdByName: string | null; permissions: Permissions; expired: boolean };

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const keys = await query<ApiKey & { createdByName: string | null; expired: number }>(
    `SELECT ${cols("api_keys", "k")}, u.name AS createdByName, (k.expires_at IS NOT NULL AND k.expires_at < CURDATE()) AS expired
     FROM api_keys k LEFT JOIN users u ON u.id = k.created_by_id
     ORDER BY k.active DESC, k.name`,
  );
  const perms = await permissionsFor(keys.map((k) => k.id));
  return keys.map(({ keyHash: _h, ...k }) => ({ ...k, expired: Boolean(Number(k.expired)), permissions: perms.get(k.id) ?? {} }));
}

export async function getApiKey(id: number) {
  return (await listApiKeys()).find((k) => k.id === id) ?? null;
}

// ---- Request authentication for /api/v1 ----

export type ApiCaller = { id: number; name: string; permissions: Permissions };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The key sent as `Authorization: Bearer <key>` or `X-API-Key: <key>`. */
function keyFrom(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return (m?.[1] ?? req.headers.get("x-api-key") ?? "").trim();
}

/**
 * Checks the request's key and that it has at least `level` on `feature` (WRITE includes READ).
 * Throws ApiError (401 / 403) otherwise. Pass no feature to only check the key is valid.
 */
export async function authenticate(req: Request, feature?: ApiFeature, level: ApiAccessLevel = "READ"): Promise<ApiCaller> {
  const key = keyFrom(req);
  if (!key) throw new ApiError(401, "Missing API key. Send it as 'Authorization: Bearer <key>'.");
  const row = await queryOne<{ id: number; name: string; active: boolean; expired: number }>(
    `SELECT id, name, active, (expires_at IS NOT NULL AND expires_at < CURDATE()) AS expired FROM api_keys WHERE key_hash = ?`,
    [hashApiKey(key)],
  );
  if (!row) throw new ApiError(401, "Invalid API key.");
  if (!row.active) throw new ApiError(401, "This API key has been disabled.");
  if (Number(row.expired)) throw new ApiError(401, "This API key has expired.");

  // Record use, at most once a minute per key.
  await execute(
    "UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL 1 MINUTE)",
    [await clientIp(), row.id],
  );

  const permissions = (await permissionsFor([row.id])).get(row.id) ?? {};
  if (feature) {
    const has = permissions[feature];
    if (!has || (level === "WRITE" && has !== "WRITE")) {
      throw new ApiError(403, `This API key doesn’t have ${level.toLowerCase()} access to ${FEATURE_INFO[feature].label.toLowerCase()}.`);
    }
  }
  return { id: row.id, name: row.name, permissions };
}

/** Wraps a route handler: authenticates, runs it, and turns errors into JSON responses. */
export function apiRoute<C>(
  feature: ApiFeature | undefined,
  level: ApiAccessLevel,
  handler: (req: Request, caller: ApiCaller, ctx: C) => Promise<unknown>,
) {
  return async (req: Request, ctx: C) => {
    try {
      const caller = await authenticate(req, feature, level);
      const result = await handler(req, caller, ctx);
      return result instanceof Response ? result : Response.json(result);
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message }, { status: e.status });
      console.error("API error", e);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

/** Reads a JSON object body, or throws a 400. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "The request body must be JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "The request body must be a JSON object.");
  return body as Record<string, unknown>;
}

/** `?limit=&offset=` with limit 1–500 (default 100). */
export function paging(url: URL) {
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get("limit"))) || 100));
  const offset = Math.max(0, Math.trunc(Number(url.searchParams.get("offset"))) || 0);
  return { limit, offset };
}

/** A positive integer route id, or a 404. */
export function idParam(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, "Not found.");
  return id;
}

/** The features as plain objects for the client-side form. */
export const featureOptions = () => API_FEATURES.map((feature) => ({ feature, ...FEATURE_INFO[feature] }));
