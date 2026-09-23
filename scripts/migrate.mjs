// Applies the SQL files in ./migrations (in filename order) to the database in DATABASE_URL.
// Each file runs once; applied files are recorded in the schema_migrations table.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const dir = path.resolve("migrations");
const conn = await mysql.createConnection({ uri: url, multipleStatements: true });

await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name varchar(255) NOT NULL PRIMARY KEY,
  applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const [applied] = await conn.query("SELECT name FROM schema_migrations");
const done = new Set(applied.map((r) => r.name));

// Databases created before the switch away from Drizzle: its migrations table
// already lists the first N files as applied, so record those instead of re-running them.
if (done.size === 0) {
  const [[legacy]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '__drizzle_migrations'",
  );
  if (Number(legacy.n) > 0) {
    const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM __drizzle_migrations");
    for (const f of files.slice(0, Number(n))) {
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
      done.add(f);
    }
    if (Number(n) > 0) console.log(`Adopted ${n} migration(s) already applied by Drizzle.`);
  }
}

let count = 0;
for (const f of files) {
  if (done.has(f)) continue;
  console.log(`Applying ${f}...`);
  await conn.query(await readFile(path.join(dir, f), "utf8"));
  await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
  count++;
}
await conn.end();
console.log(count ? `Migrations applied: ${count}.` : "Database is up to date.");
