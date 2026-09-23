import "server-only";
import { query } from "@/db";
import { cols, COLUMNS } from "@/db/types";
import { getCurrentUser } from "./auth";
import { toCsv } from "./csv";
import { todayPH } from "./format";
import { csvColumn, MASTERS, type MasterKey } from "./masters";

/** CSV download of a master list: `id` plus every form field. `?template=1` returns just the header row. */
export async function exportMasterCsv(entity: MasterKey, req: Request) {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  const cfg = MASTERS[entity];
  const header = ["id", ...cfg.fields.map(csvColumn)];
  const template = new URL(req.url).searchParams.has("template");

  let rows: Record<string, unknown>[] = [];
  if (!template) {
    // Supplier fields are exported by supplier name, which is what people edit in a spreadsheet.
    const supplierField = cfg.fields.find((f) => f.type === "supplier");
    rows = await query<Record<string, unknown>>(
      `SELECT ${cols(entity, "t")}${supplierField ? ", s.name AS __supplierName" : ""}
       FROM ${entity} t
       ${supplierField ? `LEFT JOIN suppliers s ON s.id = t.${(COLUMNS[entity] as Record<string, string>)[supplierField.name]}` : ""}
       ORDER BY t.name, t.id`,
    );
  }
  const body = toCsv([
    header,
    ...rows.map((r) => [
      r.id as number,
      ...cfg.fields.map((f) => (f.type === "supplier" ? (r.__supplierName as string | null) : (r[f.name] as string | number | null))),
    ]),
  ]);
  const name = template ? `${entity}-template.csv` : `${entity}-${todayPH()}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
