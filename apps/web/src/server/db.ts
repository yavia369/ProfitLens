import "server-only";
import { createDb, createPool, type Database } from "@profitlens/db";
import { getServerEnv } from "@profitlens/config";

const globalForDb = globalThis as unknown as { __profitlensDb?: Database };

/** Single pool per server process (survives dev hot reloads). */
export function db(): Database {
  if (!globalForDb.__profitlensDb) {
    globalForDb.__profitlensDb = createDb(createPool(getServerEnv().DATABASE_URL));
  }
  return globalForDb.__profitlensDb;
}
