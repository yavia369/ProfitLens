import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDb, createPool } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies pending migrations (idempotent). `folder` is given by bundled callers (the production image). */
export async function runMigrations(connectionString: string, folder: string = migrationsFolder): Promise<void> {
  const pool = createPool(connectionString, 1);
  try {
    await migrate(createDb(pool), { migrationsFolder: folder });
  } finally {
    await pool.end();
  }
}
