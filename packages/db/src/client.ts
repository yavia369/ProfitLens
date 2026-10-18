import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

// node-postgres returns NUMERIC/DECIMAL (OID 1700) as strings by default; keep it that way.
// BIGINT (OID 20) also stays a string unless a column opts into bigint mode.

export function createPool(connectionString: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema, casing: "snake_case" });
}
