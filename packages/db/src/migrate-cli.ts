import { runMigrations } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
await runMigrations(url, process.env.MIGRATIONS_DIR || undefined);
console.log("migrations applied");
