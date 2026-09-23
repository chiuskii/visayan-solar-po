"use server";

import { revalidatePath } from "next/cache";
import { execute, query, transaction } from "@/db";
import { cols, toRow } from "@/db/types";
import { requireUser } from "@/lib/auth";
import { parseCsv, unguardCell } from "@/lib/csv";
import { readFields } from "@/lib/master-fields";
import { csvColumn, MASTERS, type MasterKey } from "@/lib/masters";

const MAX_BYTES = 900 * 1024;
const MAX_ROWS = 5000;
const MAX_LISTED = 100;

export type ImportRow = { row: number; action: "create" | "update"; name: string; changes: string[] };
export type ImportState = {
  error?: string;
  rowErrors?: { row: number; message: string }[];
  summary?: { created: number; updated: number; unchanged: number };
  /** Rows that would change (check) or did change (import), capped at MAX_LISTED. */
  rows?: ImportRow[];
  applied?: boolean;
};

const show = (v: unknown) => (v == null || v === "" ? "(blank)" : String(v));
// Blank text is stored as NULL, but older rows may hold "" — treat them the same.
const same = (a: unknown, b: unknown) => (a === "" ? null : (a ?? null)) === (b === "" ? null : (b ?? null));

/**
 * Bulk create/update from a CSV. Rows with an `id` update that record (only the columns
 * present in the file); rows without one are added. Nothing is saved if any row is invalid.
 * intent=check only reports what would happen.
 */
export async function importMasterCsv(entity: MasterKey, _prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireUser();
  const cfg = MASTERS[entity];
  if (!cfg?.csv) return { error: "This list can’t be imported." };
  const apply = formData.get("intent") === "import";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { error: "That file is too big (limit 900 KB). Split it into smaller files." };

  const [head, ...body] = parseCsv(await file.text());
  if (!head) return { error: "The file is empty." };

  // Header → field. Accept the CSV column name or the form label, in any case.
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  const byHeader = new Map<string, string>([["id", "id"]]);
  for (const f of cfg.fields) {
    byHeader.set(csvColumn(f), f.name);
    byHeader.set(norm(f.label), f.name);
  }
  const colIndex = new Map<string, number>();
  const unknown: string[] = [];
  head.forEach((h, i) => {
    if (!h.trim()) return;
    const field = byHeader.get(norm(h));
    if (!field) unknown.push(h.trim());
    else if (colIndex.has(field)) unknown.push(`${h.trim()} (duplicate)`);
    else colIndex.set(field, i);
  });
  if (unknown.length) {
    return { error: `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Expected: ${["id", ...cfg.fields.map(csvColumn)].join(", ")}.` };
  }
  if (!colIndex.has("id") && !colIndex.has("name")) return { error: "The file needs an id or name column." };

  const lines = body
    .map((cells, i) => ({ row: i + 2, cells })) // row 1 is the header, as in a spreadsheet
    .filter(({ cells }) => cells.some((c) => c.trim()));
  if (lines.length === 0) return { error: "The file has a header but no rows." };
  if (lines.length > MAX_ROWS) return { error: `Too many rows (${lines.length}). The limit is ${MAX_ROWS} per file.` };

  const cell = (cells: string[], field: string) => {
    const i = colIndex.get(field);
    return i === undefined ? undefined : unguardCell(cells[i] ?? "");
  };

  // Existing records referenced by id.
  const ids = lines.map((l) => cell(l.cells, "id")?.trim()).filter((v): v is string => !!v);
  const numericIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const existing = new Map<number, Record<string, unknown>>();
  if (numericIds.length) {
    for (const r of await query<Record<string, unknown>>(`SELECT ${cols(entity)} FROM ${entity} WHERE id IN (?)`, [numericIds])) {
      existing.set(r.id as number, r);
    }
  }

  // Supplier names → ids, for supplier fields.
  const supplierField = cfg.fields.find((f) => f.type === "supplier" && colIndex.has(f.name));
  const suppliersByName = new Map<string, { id: number; name: string }[]>();
  const supplierName = new Map<number, string>();
  if (supplierField) {
    for (const s of await query<{ id: number; name: string }>("SELECT id, name FROM suppliers")) {
      const key = s.name.trim().toLowerCase();
      suppliersByName.set(key, [...(suppliersByName.get(key) ?? []), s]);
      supplierName.set(s.id, s.name);
    }
  }

  // Existing names (name + spec for materials), to warn when a "new" row looks like a duplicate.
  const identity = (r: Record<string, unknown>) =>
    [r.name, entity === "materials" ? r.spec : ""].map((v) => String(v ?? "").trim().toLowerCase()).join("|");
  const byIdentity = new Map<string, number>();
  for (const r of await query<Record<string, unknown>>(`SELECT id, name${entity === "materials" ? ", spec" : ""} FROM ${entity}`)) {
    byIdentity.set(identity(r), r.id as number);
  }

  const rowErrors: { row: number; message: string }[] = [];
  const seenIds = new Set<number>();
  const creates: { row: number; values: Record<string, unknown> }[] = [];
  const updates: { row: number; id: number; values: Record<string, unknown> }[] = [];
  const listed: ImportRow[] = [];
  let unchanged = 0;

  for (const { row, cells } of lines) {
    try {
      const rawId = cell(cells, "id")?.trim();
      const id = rawId ? Number(rawId) : null;
      if (rawId && !(Number.isInteger(id) && id! > 0)) throw new Error(`“${rawId}” isn’t a valid id. Leave id blank to add a new ${cfg.singular.toLowerCase()}.`);
      if (id && !existing.has(id)) throw new Error(`No ${cfg.singular.toLowerCase()} with id ${id}. Leave id blank to add a new one.`);
      if (id && seenIds.has(id)) throw new Error(`id ${id} appears more than once in the file.`);
      if (id) seenIds.add(id);

      const get = (name: string) => {
        const v = cell(cells, name);
        if (v === undefined) return id ? undefined : ""; // missing column: leave as-is on update, blank on create
        const f = cfg.fields.find((x) => x.name === name);
        if (f?.type !== "supplier" || !v.trim()) return v;
        const matches = suppliersByName.get(v.trim().toLowerCase()) ?? [];
        if (matches.length === 0) throw new Error(`No supplier named “${v.trim()}”. Add it under Suppliers first, or fix the spelling.`);
        if (matches.length > 1) throw new Error(`${matches.length} suppliers are named “${v.trim()}”. Rename one so they can be told apart.`);
        return String(matches[0].id);
      };
      const values = readFields(entity, get);

      if (id) {
        const before = existing.get(id)!;
        const changed = Object.entries(values).filter(([k, v]) => !same(before[k], v));
        if (changed.length === 0) {
          unchanged++;
          continue;
        }
        const label = (k: string) => cfg.fields.find((f) => f.name === k)?.label ?? k;
        const fmt = (k: string, v: unknown) =>
          cfg.fields.find((f) => f.name === k)?.type === "supplier" ? show(v == null ? null : supplierName.get(v as number)) : show(v);
        updates.push({ row, id, values: Object.fromEntries(changed) });
        listed.push({
          row,
          action: "update",
          name: String(values.name ?? before.name),
          changes: changed.map(([k, v]) => `${label(k)}: ${fmt(k, before[k])} → ${fmt(k, v)}`),
        });
      } else {
        creates.push({ row, values });
        const dupe = byIdentity.get(identity(values));
        listed.push({
          row,
          action: "create",
          name: String(values.name),
          changes: dupe ? [`⚠ Looks like existing id ${dupe}. Put ${dupe} in the id column to update it instead of adding a copy.`] : [],
        });
      }
    } catch (e) {
      rowErrors.push({ row, message: (e as Error).message });
    }
  }

  const summary = { created: creates.length, updated: updates.length, unchanged };
  if (rowErrors.length) {
    return {
      error: `${rowErrors.length} row${rowErrors.length > 1 ? "s have" : " has"} problems. Nothing was imported — fix ${rowErrors.length > 1 ? "them" : "it"} and try again.`,
      rowErrors: rowErrors.slice(0, MAX_LISTED),
    };
  }
  if (!apply || (creates.length === 0 && updates.length === 0)) {
    return { summary, rows: listed.slice(0, MAX_LISTED) };
  }

  await transaction(async (conn) => {
    for (const u of updates) await execute(`UPDATE ${entity} SET ? WHERE id = ?`, [toRow(entity, u.values), u.id], conn);
    for (const c of creates) await execute(`INSERT INTO ${entity} SET ?`, [toRow(entity, c.values)], conn);
  });
  revalidatePath(`/${entity}`);
  return { summary, rows: listed.slice(0, MAX_LISTED), applied: true };
}
