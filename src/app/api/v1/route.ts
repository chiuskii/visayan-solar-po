import { API_FEATURES } from "@/db/types";
import { apiRoute, FEATURE_INFO } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

/** Which key this is and what it may do. Works for any valid key. */
export const GET = apiRoute(undefined, "READ", async (_req, caller) => ({
  key: caller.name,
  permissions: Object.fromEntries(API_FEATURES.map((f) => [f, { label: FEATURE_INFO[f].label, access: caller.permissions[f] ?? "NONE" }])),
}));
