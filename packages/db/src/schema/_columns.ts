import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Money column. NUMERIC(20,6) is returned by node-postgres as a string, so values never pass
 * through a JS float. Convert with `new Decimal(value)` in application code.
 */
export const money = (name: string) => numeric(name, { precision: 20, scale: 6 });

/** Ratio / percentage column (e.g. fee rate 2.9 means 2.9 %). */
export const rate = (name: string) => numeric(name, { precision: 12, scale: 6 });

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
