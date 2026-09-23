import { exportMasterCsv } from "@/lib/master-csv";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return exportMasterCsv("clients", req);
}
