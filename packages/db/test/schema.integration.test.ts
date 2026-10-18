import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, createPool, type Database } from "../src/client.js";
import { runMigrations } from "../src/migrate.js";
import { assertStoresInScope, resolveScope, TenantAccessError } from "../src/scope.js";
import * as s from "../src/schema/index.js";

const url = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";

let pool: pg.Pool;
let db: Database;

async function resetDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await admin.end();
  await runMigrations(url);
}

async function truncateAll(): Promise<void> {
  await db.execute(sql`TRUNCATE "organization", "user", "fx_rate" RESTART IDENTITY CASCADE`);
}

async function seedOrgWithStore(suffix: string) {
  const [org] = await db.insert(s.organization).values({ name: `Org ${suffix}` }).returning();
  const [st] = await db
    .insert(s.store)
    .values({
      organizationId: org!.id,
      shopDomain: `store-${suffix}.myshopify.com`,
      name: `Store ${suffix}`,
      currency: "AUD",
      ianaTimezone: "Australia/Sydney",
    })
    .returning();
  const [prod] = await db.insert(s.product).values({ storeId: st!.id, shopifyGid: `gid://shopify/Product/${suffix}`, title: "Shoe" }).returning();
  const [vari] = await db
    .insert(s.variant)
    .values({ storeId: st!.id, productId: prod!.id, shopifyGid: `gid://shopify/ProductVariant/${suffix}`, title: "Black / 8" })
    .returning();
  return { org: org!, store: st!, variant: vari! };
}

function costVersion(storeId: string, variantId: string, from: string, to: string | null, cost = "10.00") {
  return { storeId, variantId, effectiveFrom: from, effectiveTo: to, currency: "AUD", productCost: cost, source: "manual" as const };
}

/** Postgres error code of a failed drizzle query (drizzle wraps the pg error in `cause`). */
async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
}

beforeAll(async () => {
  await resetDatabase();
  pool = createPool(url, 4);
  db = createDb(pool);
});

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await truncateAll();
});

describe("money columns", () => {
  it("round-trips NUMERIC(20,6) as exact strings, never floats", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("money");
    await db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-01-01", null, "0.1"));
    await db.update(s.variantCostVersion).set({ inboundShipping: "0.2" }).where(eq(s.variantCostVersion.variantId, v.id));
    const [row] = await db
      .select({ total: sql<string>`${s.variantCostVersion.productCost} + ${s.variantCostVersion.inboundShipping}` })
      .from(s.variantCostVersion);
    expect(typeof row!.total).toBe("string");
    expect(row!.total).toBe("0.300000"); // 0.1 + 0.2 is exact in NUMERIC (0.30000000000000004 in float)
  });
});

describe("variant cost versions (effective dating)", () => {
  it("accepts adjacent periods [Jan, Mar) and [Mar, open)", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("adj");
    await db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-01-01", "2026-03-01"));
    await db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-03-01", null, "12.00"));
    const rows = await db.select().from(s.variantCostVersion).where(eq(s.variantCostVersion.variantId, v.id));
    expect(rows).toHaveLength(2);
  });

  it("rejects overlapping periods for the same variant (exclusion constraint)", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("ovl");
    await db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-01-01", null));
    expect(await pgErrorCode(db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-06-01", "2026-07-01")))).toBe("23P01");
  });

  it("rejects an empty or inverted interval", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("inv");
    expect(await pgErrorCode(db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-05-01", "2026-05-01")))).toBe("23514");
  });

  it("rejects negative costs", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("neg");
    expect(await pgErrorCode(db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-01-01", null, "-1")))).toBe("23514");
  });

  it("finds the version effective on a given order date", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("lookup");
    await db.insert(s.variantCostVersion).values([
      costVersion(st.id, v.id, "2026-01-01", "2026-03-01", "10.00"),
      costVersion(st.id, v.id, "2026-03-01", null, "12.50"),
    ]);
    const lookup = (d: string) =>
      db
        .select({ cost: s.variantCostVersion.productCost })
        .from(s.variantCostVersion)
        .where(sql`${s.variantCostVersion.variantId} = ${v.id} AND daterange(${s.variantCostVersion.effectiveFrom}, ${s.variantCostVersion.effectiveTo}, '[)') @> ${d}::date`);
    expect((await lookup("2026-02-28"))[0]!.cost).toBe("10.000000");
    expect((await lookup("2026-03-01"))[0]!.cost).toBe("12.500000");
    expect(await lookup("2025-12-31")).toHaveLength(0); // no version → "missing", never zero
  });
});

describe("idempotent upserts by external id", () => {
  it("re-importing the same order GID updates in place instead of duplicating", async () => {
    const { store: st } = await seedOrgWithStore("upsert");
    const base = {
      storeId: st.id,
      shopifyGid: "gid://shopify/Order/1",
      name: "#1001",
      createdAtShopify: new Date("2026-10-01T00:00:00Z"),
      processedAt: new Date("2026-10-01T00:00:00Z"),
      processedLocalDate: "2026-10-01",
      currency: "AUD",
    };
    const upsert = (financialStatus: string, updatedAt: string) =>
      db
        .insert(s.order)
        .values({ ...base, financialStatus, shopifyUpdatedAt: new Date(updatedAt) })
        .onConflictDoUpdate({
          target: [s.order.storeId, s.order.shopifyGid],
          set: { financialStatus, shopifyUpdatedAt: new Date(updatedAt) },
          // Ignore stale deliveries (older Shopify updated_at).
          setWhere: sql`${s.order.shopifyUpdatedAt} < excluded.shopify_updated_at`,
        });
    await upsert("PENDING", "2026-10-01T00:00:00Z");
    await upsert("PAID", "2026-10-01T01:00:00Z");
    await upsert("PENDING", "2026-10-01T00:30:00Z"); // late, stale webhook
    const rows = await db.select().from(s.order).where(eq(s.order.storeId, st.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.financialStatus).toBe("PAID");
  });

  it("deduplicates webhook deliveries by provider + webhook id", async () => {
    const values = { externalId: "wh-123", topic: "orders/updated", payloadSha256: "abc" };
    await db.insert(s.webhookEvent).values(values).onConflictDoNothing();
    await db.insert(s.webhookEvent).values(values).onConflictDoNothing();
    expect(await db.select().from(s.webhookEvent)).toHaveLength(1);
  });
});

describe("expense constraints", () => {
  it("requires a frequency for recurring expenses and a percent for percentage expenses", async () => {
    const { org, store: st } = await seedOrgWithStore("exp");
    const common = { organizationId: org.id, storeId: st.id, name: "Shopify plan", currency: "AUD", startDate: "2026-10-01" };
    expect(await pgErrorCode(db.insert(s.expense).values({ ...common, type: "recurring", amount: "39" }))).toBe("23514");
    expect(await pgErrorCode(db.insert(s.expense).values({ ...common, type: "percent_of_revenue", amount: "5" }))).toBe("23514");
    await db.insert(s.expense).values({ ...common, type: "recurring", frequency: "monthly", amount: "39" });
    await db.insert(s.expense).values({ ...common, name: "Agency", type: "percent_of_revenue", percent: "5" });
    expect(await db.select().from(s.expense)).toHaveLength(2);
  });
});

describe("tenant isolation", () => {
  it("rejects access to another organization's store and accepts own store", async () => {
    const a = await seedOrgWithStore("a");
    const b = await seedOrgWithStore("b");
    await db.insert(s.user).values({ id: "user-a", name: "A", email: "a@example.com" });
    await db.insert(s.membership).values({ organizationId: a.org.id, userId: "user-a", role: "owner" });

    const scope = await resolveScope(db, "user-a", a.org.id);
    expect(await assertStoresInScope(db, scope, [a.store.id])).toEqual([a.store.id]);
    await expect(assertStoresInScope(db, scope, [b.store.id])).rejects.toBeInstanceOf(TenantAccessError);
    await expect(assertStoresInScope(db, scope, [a.store.id, b.store.id])).rejects.toBeInstanceOf(TenantAccessError);
    await expect(resolveScope(db, "user-a", b.org.id)).rejects.toBeInstanceOf(TenantAccessError);
  });

  it("cascades store deletion to all store-owned data", async () => {
    const { store: st, variant: v } = await seedOrgWithStore("cascade");
    await db.insert(s.variantCostVersion).values(costVersion(st.id, v.id, "2026-01-01", null));
    await db.delete(s.store).where(eq(s.store.id, st.id));
    expect(await db.select().from(s.variant)).toHaveLength(0);
    expect(await db.select().from(s.variantCostVersion)).toHaveLength(0);
  });
});

describe("store constraints", () => {
  it("rejects malformed Shopify domains and lower-case currencies", async () => {
    const [org] = await db.insert(s.organization).values({ name: "X" }).returning();
    const base = { organizationId: org!.id, name: "X", ianaTimezone: "UTC" };
    expect(await pgErrorCode(db.insert(s.store).values({ ...base, shopDomain: "evil.com", currency: "AUD" }))).toBe("23514");
    expect(await pgErrorCode(db.insert(s.store).values({ ...base, shopDomain: "ok.myshopify.com", currency: "aud" }))).toBe("23514");
  });
});
