import "server-only";
import mysql from "mysql2/promise";

const globalForDb = globalThis as unknown as { pool?: mysql.Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return mysql.createPool({
    uri: url,
    connectionLimit: 10,
    dateStrings: true,
    timezone: "+08:00",
    // DECIMAL columns come back as numbers, not strings.
    decimalNumbers: true,
    // BOOLEAN (TINYINT(1)) columns come back as true/false.
    typeCast: (field, next) => (field.type === "TINY" && field.length === 1 ? field.string() === "1" : next()),
  });
}

/** The shared pool, created on first use and reused across hot reloads in development. */
export function getPool() {
  return (globalForDb.pool ??= createPool());
}

type Conn = mysql.Pool | mysql.PoolConnection;
export type Params = unknown[];

/** Runs a SELECT and returns all rows. */
export async function query<T>(sql: string, params: Params = [], conn: Conn = getPool()): Promise<T[]> {
  const [rows] = await conn.query(sql, params as mysql.QueryValues);
  return rows as T[];
}

/** Runs a SELECT and returns the first row, or undefined. */
export async function queryOne<T>(sql: string, params: Params = [], conn: Conn = getPool()): Promise<T | undefined> {
  return (await query<T>(sql, params, conn))[0];
}

/** Runs an INSERT / UPDATE / DELETE. */
export async function execute(sql: string, params: Params = [], conn: Conn = getPool()): Promise<mysql.ResultSetHeader> {
  const [res] = await conn.query(sql, params as mysql.QueryValues);
  return res as mysql.ResultSetHeader;
}

/** Runs `fn` inside a transaction on one connection; rolls back if it throws. */
export async function transaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
