import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return mysql.createPool({ uri: url, connectionLimit: 10, dateStrings: true, timezone: "+08:00" });
}

// Reuse one pool across hot reloads in development.
const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
