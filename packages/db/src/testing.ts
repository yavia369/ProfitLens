import pg from "pg";
import { runMigrations } from "./migrate";

/**
 * Test-only: gives each integration suite its own freshly migrated database
 * (`<base>_<suffix>`) so suites running in parallel never reset each other's data.
 */
export async function freshTestDatabase(baseUrl: string, suffix: string): Promise<string> {
  if (!/^[a-z0-9_]+$/.test(suffix)) throw new Error(`Invalid test database suffix: ${suffix}`);
  const base = new URL(baseUrl);
  const name = `${base.pathname.replace(/^\//, "")}_${suffix}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const target = new pg.Client({ connectionString: url.toString() });
  await target.connect();
  try {
    await target.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await target.end();
  }
  await runMigrations(url.toString());
  return url.toString();
}
