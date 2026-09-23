// Waits until MySQL accepts connections (used by Docker entrypoints).
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
for (let i = 1; i <= 60; i++) {
  try {
    const conn = await mysql.createConnection(url);
    await conn.end();
    console.log("Database is ready.");
    process.exit(0);
  } catch {
    console.log(`Waiting for database... (${i}/60)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.error("Database did not become ready in time.");
process.exit(1);
