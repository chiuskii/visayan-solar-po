import { masterListRoutes } from "@/lib/api-masters";

export const dynamic = "force-dynamic";
export const { GET, POST } = masterListRoutes("clients");
