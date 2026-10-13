import { apiRoute } from "@/lib/api-keys";
import { listBundles } from "@/lib/bundles";

export const dynamic = "force-dynamic";

export const GET = apiRoute("bundles", "READ", async () => ({ data: await listBundles() }));
