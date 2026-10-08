// Comma / semicolon / newline separated email lists (report recipients).
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function parseEmailList(raw: string | null | undefined) {
  const items = (raw ?? "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const emails = [...new Set(items.filter((e) => EMAIL.test(e)).map((e) => e.toLowerCase()))];
  const invalid = items.filter((e) => !EMAIL.test(e));
  return { emails, invalid };
}
