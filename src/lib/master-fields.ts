import "server-only";
import { MASTERS, type MasterKey } from "./masters";

/**
 * Validates a master record's fields. `get(name)` returns the raw text for a field, or
 * undefined to leave that field out (CSV imports that don't include the column).
 * Throws an Error with a user-facing message on the first invalid field.
 */
export function readFields(entity: MasterKey, get: (name: string) => string | undefined) {
  const values: Record<string, string | number | null> = {};
  for (const f of MASTERS[entity].fields) {
    const got = get(f.name);
    if (got === undefined) continue;
    const raw = got.trim();
    if (f.required && !raw) throw new Error(`${f.label} is required.`);
    if (f.type === "supplier") {
      const n = raw === "" ? null : Number(raw);
      if (n !== null && !Number.isInteger(n)) throw new Error(`Choose a valid ${f.label.toLowerCase()}.`);
      values[f.name] = n;
    } else if (f.type === "number") {
      // Accept "₱1,234.50" as pasted from a spreadsheet.
      const cleaned = raw.replace(/[₱,\s]/g, "");
      const n = cleaned === "" ? 0 : Number(cleaned);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${f.label} must be a positive number.`);
      values[f.name] = Math.round(n * 100) / 100;
    } else {
      if (raw.length > 2000) throw new Error(`${f.label} is too long.`);
      values[f.name] = raw || null;
    }
  }
  return values;
}
