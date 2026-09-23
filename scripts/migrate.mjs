// Applies SQL migrations in ./drizzle to the database in DATABASE_URL.
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
await migrate(drizzle(conn), { migrationsFolder: "./drizzle" });
await conn.end();
console.log("Migrations applied.");
