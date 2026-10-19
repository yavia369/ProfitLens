import { runMigrations } from "@profitlens/db/migrate";

/** Release step in the production image: applies migrations from MIGRATIONS_DIR (copied next to the bundle). */
const url = process.env.DATABASE_URL;
const folder = process.env.MIGRATIONS_DIR;
if (!url || !folder) throw new Error("DATABASE_URL and MIGRATIONS_DIR are required");
await runMigrations(url, folder);
console.log("migrations applied");
process.exit(0);
