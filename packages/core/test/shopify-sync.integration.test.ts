import { randomBytes } from "node:crypto";
import { createDb, createPool, schema, type Database, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import type { FetchLike, RawOrder, RawProduct } from "@profitlens/shopify";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createHmac } from "node:crypto";
import { connectStoreWithClientCredentials, ConnectionError, dayBoundsUtc, handleShopifyWebhook, ShopifySyncService } from "../src/shopify";
import {
  applyCostImport,
  applyRecalc,
  archiveExpense,
  CostInputError,
  DbReportingDataSource,
  exportCostsCsv,
  gatewaySummary,
  getPolicy,
  listExpenses,
  listVariantCosts,
  previewCostImport,
  ProfitService,
  saveExpense,
  saveGatewayRule,
  saveHandlingRule,
  savePolicy,
  saveShippingRule,
  deleteShippingRule,
  setVariantCost,
  variantCostHistory,
} from "../src/profit";
import { ReportingService } from "../src/reporting/service";
import { dec, DEFAULT_POLICY, ENGINE_VERSION, sum } from "@profitlens/finance";
import { pagedOrder } from "../../shopify/test/fixtures/orders";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
const keyring = { keys: { k1: randomBytes(32).toString("base64") }, activeKid: "k1" };
const SHOP = "luraflo-test.myshopify.com";
const ALL_SCOPES = "read_orders,read_products,read_inventory,read_customers,read_returns,read_shopify_payments_payouts,read_shopify_payments_disputes";

let pool: pg.Pool;
let db: Database;

/** In-memory fake of the Shopify endpoints used by the sync (driven by mutable state per test). */
function fakeShopify(state: { orders: RawOrder[]; products: RawProduct[]; scopes: string; ordersCount: number; tokenRequests: number }) {
  const respond = (status: number, body: unknown) => ({
    ok: status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  const cost = { requestedQueryCost: 10, actualQueryCost: 10, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1900, restoreRate: 100 } };
  const toJsonl = (roots: { id: string }[], kind: "orders" | "products") => {
    const lines: string[] = [];
    for (const r of roots) {
      const o = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
      const children: [string, unknown][] = [];
      for (const key of kind === "orders" ? ["lineItems", "agreements"] : ["variants"]) {
        const c = o[key] as { edges: { node: Record<string, unknown> }[] };
        delete o[key];
        for (const e of c.edges) children.push([key, e.node]);
      }
      // Like Shopify, bulk exports carry no refund lines (a connection inside the `refunds` list).
      if (kind === "orders") for (const rf of o.refunds as Record<string, unknown>[]) delete rf.refundLineItems;
      lines.push(JSON.stringify(o));
      for (const [key, node] of children) {
        const n = node as Record<string, unknown>;
        if (key === "agreements") {
          const sales = n.sales as { edges: { node: object }[] };
          const { sales: _s, ...a } = n;
          lines.push(JSON.stringify({ ...a, __parentId: r.id }));
          for (const s of sales.edges) lines.push(JSON.stringify({ ...s.node, __parentId: n.id }));
        } else lines.push(JSON.stringify({ ...n, __parentId: r.id }));
      }
    }
    return lines.join("\n");
  };
  const fetchImpl = (async (u: string, init: { method: string; body?: string }) => {
    if (u.endsWith("/admin/oauth/access_token")) {
      state.tokenRequests += 1;
      return respond(200, { access_token: `shpat_${state.tokenRequests}`, scope: state.scopes, expires_in: 86399 });
    }
    if (u === "https://storage.test/orders.jsonl") return respond(200, toJsonl(state.orders, "orders"));
    if (u === "https://storage.test/products.jsonl") return respond(200, toJsonl(state.products, "products"));
    const { query, variables } = JSON.parse(init.body ?? "{}") as { query: string; variables: Record<string, unknown> };
    if (query.includes("ShopInfo"))
      return respond(200, { data: { shop: { id: "gid://shopify/Shop/1", name: "Luraflo Test", myshopifyDomain: SHOP, currencyCode: "AUD", ianaTimezone: "Australia/Sydney", taxesIncluded: false, plan: { displayName: "Basic", publicDisplayName: "Basic", shopifyPlus: false, partnerDevelopment: false } } }, extensions: { cost } });
    if (query.includes("RunBulk")) {
      const id = String(variables.query).includes("products") && !String(variables.query).includes("orders") ? "gid://shopify/BulkOperation/1" : "gid://shopify/BulkOperation/2";
      return respond(200, { data: { bulkOperationRunQuery: { bulkOperation: { id, status: "CREATED" }, userErrors: [] } }, extensions: { cost } });
    }
    if (query.includes("BulkStatus")) {
      const isProducts = String(variables.id).endsWith("/1");
      return respond(200, { data: { node: { id: variables.id, status: "COMPLETED", errorCode: null, objectCount: "10", rootObjectCount: "1", url: isProducts ? "https://storage.test/products.jsonl" : "https://storage.test/orders.jsonl", partialDataUrl: null } }, extensions: { cost } });
    }
    if (query.includes("ProductsPage")) return respond(200, { data: { products: { edges: state.products.map((node) => ({ node })), pageInfo: { hasNextPage: false, endCursor: null } } }, extensions: { cost } });
    if (query.includes("OrdersPage")) return respond(200, { data: { orders: { edges: state.orders.map((node) => ({ cursor: node.id, node })), pageInfo: { hasNextPage: false, endCursor: null } } }, extensions: { cost } });
    if (query.includes("OrderById")) return respond(200, { data: { order: state.orders.find((o) => o.id === variables.id) ?? null }, extensions: { cost } });
    if (query.includes("Disputes"))
      return respond(200, { data: { disputes: { edges: [{ node: { id: "gid://shopify/ShopifyPaymentsDispute/1", type: "CHARGEBACK", status: "LOST", initiatedAt: "2026-10-09T00:00:00Z", finalizedOn: "2026-10-12", amount: { amount: "159.88", currencyCode: "AUD" }, reasonDetails: { reason: "FRAUDULENT" }, order: { id: "gid://shopify/Order/5001" } } }], pageInfo: { hasNextPage: false, endCursor: null } } }, extensions: { cost } });
    if (query.includes("OrdersCount")) return respond(200, { data: { ordersCount: { count: state.ordersCount, precision: "EXACT" } }, extensions: { cost } });
    throw new Error(`unexpected request ${u} ${query.slice(0, 60)}`);
  }) as unknown as FetchLike;
  return fetchImpl;
}

function product(unitCost: string | null): RawProduct {
  return {
    id: "gid://shopify/Product/10",
    title: "Sneaker",
    status: "ACTIVE",
    productType: "Shoes",
    vendor: "Demo",
    updatedAt: "2026-10-01T00:00:00Z",
    variants: {
      edges: [
        { node: { id: "gid://shopify/ProductVariant/11", title: "Black / 8", sku: "SNK-8", price: "89.95", updatedAt: null, inventoryItem: { id: "gid://shopify/InventoryItem/111", requiresShipping: true, unitCost: unitCost ? { amount: unitCost, currencyCode: "AUD" } : null, measurement: null } } },
        { node: { id: "gid://shopify/ProductVariant/21", title: "Default", sku: "SOCK", price: "24.95", updatedAt: null, inventoryItem: { id: "gid://shopify/InventoryItem/211", requiresShipping: true, unitCost: null, measurement: null } } },
      ],
    },
  };
}

async function seedOrg(name: string): Promise<OrgScope> {
  const userId = `user-${name}-${Date.now()}`;
  await db.insert(schema.user).values({ id: userId, name, email: `${userId}@example.com` });
  const [org] = await db.insert(schema.organization).values({ name }).returning();
  await db.insert(schema.membership).values({ organizationId: org!.id, userId, role: "owner" });
  return { userId, organizationId: org!.id, role: "owner" };
}

const count = async (table: string, storeId: string) =>
  Number(((await db.execute(sql.raw(`select count(*)::int as n from "${table}" where store_id = '${storeId}'`))).rows[0] as { n: number }).n);

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "core"), 4);
  db = createDb(pool);
});

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "organization", "user", "shopify_app" RESTART IDENTITY CASCADE`);
});

describe("Shopify connection and sync (mock Shopify, real Postgres)", () => {
  const NOW = new Date("2026-10-18T03:00:00Z");
  const setup = async () => {
    const state = { orders: [pagedOrder()], products: [product("31.20")], scopes: ALL_SCOPES, ordersCount: 1, tokenRequests: 0 };
    const fetchImpl = fakeShopify(state);
    const deps = { db, keyring, apiVersion: "2026-10", fetch: fetchImpl, sleep: async () => {}, now: () => NOW };
    const scope = await seedOrg("owner");
    const conn = await connectStoreWithClientCredentials(deps, scope, { shopDomain: `https://${SHOP}/admin`, clientId: "client-id-123", clientSecret: "shpss_very_secret_value" });
    return { state, deps, scope, conn, sync: new ShopifySyncService(deps) };
  };

  it("connects a store: stores shop facts, encrypts secrets, creates policy v1 and an audit entry", async () => {
    const { conn, scope } = await setup();
    expect(conn).toMatchObject({ shopName: "Luraflo Test", historyLimited: true });
    const [st] = await db.select().from(schema.store).where(eq(schema.store.id, conn.storeId));
    expect(st).toMatchObject({ shopDomain: SHOP, currency: "AUD", ianaTimezone: "Australia/Sydney", thirdPartyFeeRate: "2.000000", organizationId: scope.organizationId });
    const dump = JSON.stringify(await db.execute(sql`select * from shopify_app, store_connection`));
    expect(dump).not.toContain("shpss_very_secret_value");
    expect(dump).not.toContain("shpat_1");
    expect(await db.select().from(schema.financialPolicy).where(eq(schema.financialPolicy.storeId, conn.storeId))).toHaveLength(1);
    expect((await db.select().from(schema.auditLog))[0]).toMatchObject({ action: "store.connect", entityId: conn.storeId });
  });

  it("refuses connections with missing scopes without persisting anything", async () => {
    const state = { orders: [], products: [], scopes: "read_orders,read_products", ordersCount: 0, tokenRequests: 0 };
    const deps = { db, keyring, apiVersion: "2026-10", fetch: fakeShopify(state) };
    const scope = await seedOrg("x");
    await expect(connectStoreWithClientCredentials(deps, scope, { shopDomain: SHOP, clientId: "client-id-123", clientSecret: "secret-123456" })).rejects.toMatchObject({ code: "missing_scopes" });
    expect(await db.select().from(schema.store)).toHaveLength(0);
  });

  it("prevents connecting the same store into a second workspace", async () => {
    const { deps } = await setup();
    const other = await seedOrg("intruder");
    await expect(connectStoreWithClientCredentials(deps, other, { shopDomain: SHOP, clientId: "client-id-999", clientSecret: "secret-999999" })).rejects.toBeInstanceOf(ConnectionError);
  });

  it("backfills products and orders with all child facts, idempotently", async () => {
    const { conn, sync } = await setup();
    const first = await sync.backfill(conn.storeId);
    expect(first.stats).toMatchObject({ orders: 1, products: 1, variants: 2, costVersionsCreated: 1, disputes: 1 });
    expect(first.historyStart).toBe("2026-10-03");
    const counts = async () => ({
      orders: await count("order", conn.storeId),
      lines: await count("order_line_item", conn.storeId),
      sales: await count("sale_ledger_entry", conn.storeId),
      refunds: await count("refund", conn.storeId),
      refundLines: await count("refund_line_item", conn.storeId),
      tx: await count("payment_transaction", conn.storeId),
      fulfillments: await count("fulfillment", conn.storeId),
      variants: await count("variant", conn.storeId),
      costVersions: await count("variant_cost_version", conn.storeId),
      disputes: await count("dispute", conn.storeId),
    });
    const before = await counts();
    expect(before).toEqual({ orders: 1, lines: 2, sales: 6, refunds: 1, refundLines: 1, tx: 2, fulfillments: 1, variants: 2, costVersions: 1, disputes: 1 });

    // Line items are linked to imported variants; the variant without a cost has no version (missing, not zero).
    const lines = await db.select().from(schema.orderLineItem).where(eq(schema.orderLineItem.storeId, conn.storeId));
    expect(lines.every((l) => l.variantId !== null)).toBe(true);
    const [cv] = await db.select().from(schema.variantCostVersion);
    expect(cv).toMatchObject({ productCost: "31.200000", source: "shopify_sync", effectiveFrom: "2000-01-01", effectiveTo: null });
    const [cust] = await db.select().from(schema.customer);
    expect(cust).toMatchObject({ ordersCount: 1, firstOrderLocalDate: "2026-10-03", countryCode: "AU" });
    const [dispute] = await db.select().from(schema.dispute);
    expect(dispute!.orderId).not.toBeNull();

    await sync.backfill(conn.storeId);
    expect(await counts()).toEqual(before);
    const jobs = await db.select().from(schema.syncJob).where(eq(schema.syncJob.storeId, conn.storeId));
    expect(jobs.filter((j) => j.status === "succeeded")).toHaveLength(2);
  });

  it("incremental sync ignores stale payloads and replaces children for newer ones", async () => {
    const { conn, sync, state } = await setup();
    await sync.backfill(conn.storeId);

    // Stale delivery (older updatedAt, with a bogus extra refund) is ignored entirely.
    const stale = pagedOrder();
    stale.updatedAt = "2026-10-05T00:00:00Z";
    stale.displayFinancialStatus = "PAID";
    state.orders = [stale];
    const r1 = await sync.incremental(conn.storeId);
    expect(r1.stats).toMatchObject({ orders: 0, ordersSkippedStale: 1 });
    const [o1] = await db.select().from(schema.order);
    expect(o1!.financialStatus).toBe("PARTIALLY_REFUNDED");

    // Newer version: the second sneaker is refunded too (no restock) → one more refund, sales replaced not duplicated.
    const newer = pagedOrder();
    newer.updatedAt = "2026-10-12T00:00:00Z";
    newer.displayFinancialStatus = "PARTIALLY_REFUNDED";
    const agreements = newer.agreements as unknown as { edges: { node: Record<string, unknown> }[] };
    agreements.edges.push({
      node: {
        id: "gid://shopify/SalesAgreement/903",
        happenedAt: "2026-10-12T00:00:00Z",
        reason: "REFUND",
        __typename: "RefundAgreement",
        refund: { id: "gid://shopify/Refund/301" },
        sales: { edges: [{ node: { id: "gid://shopify/Sale/7", actionType: "RETURN", lineType: "PRODUCT", quantity: -1, totalAmount: { shopMoney: { amount: "-89.06", currencyCode: "AUD" } }, totalDiscountAmountBeforeTaxes: { shopMoney: { amount: "-9.00", currencyCode: "AUD" } }, totalDiscountAmountAfterTaxes: { shopMoney: { amount: "-9.90", currencyCode: "AUD" } }, totalTaxAmount: { shopMoney: { amount: "-8.10", currencyCode: "AUD" } }, lineItem: { id: "gid://shopify/LineItem/1" } } }], pageInfo: { hasNextPage: false } },
      },
    });
    newer.refunds.push({ id: "gid://shopify/Refund/301", createdAt: "2026-10-12T00:00:00Z", note: null, totalRefundedSet: { shopMoney: { amount: "89.06", currencyCode: "AUD" } }, refundLineItems: { edges: [{ node: { id: "gid://shopify/RefundLineItem/311", quantity: 1, restockType: "NO_RESTOCK", restocked: false, lineItem: { id: "gid://shopify/LineItem/1" }, subtotalSet: null, totalTaxSet: null } }] } });
    state.orders = [newer];
    const r2 = await sync.incremental(conn.storeId);
    expect(r2.stats.orders).toBe(1);
    expect(await count("sale_ledger_entry", conn.storeId)).toBe(7);
    expect(await count("refund", conn.storeId)).toBe(2);
    expect(await count("refund_line_item", conn.storeId)).toBe(2);
    const [conn2] = await db.select().from(schema.storeConnection);
    expect(conn2!.ordersSyncedThrough!.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("versions Shopify cost changes by date and never overrides a manual cost", async () => {
    const { conn, sync, state } = await setup();
    await sync.backfill(conn.storeId);
    state.orders = [];
    state.products = [product("33.90")];
    await sync.incremental(conn.storeId);
    const versions = await db.select().from(schema.variantCostVersion).orderBy(schema.variantCostVersion.effectiveFrom);
    expect(versions.map((v) => [v.effectiveFrom, v.effectiveTo, v.productCost])).toEqual([
      ["2000-01-01", "2026-10-18", "31.200000"],
      ["2026-10-18", null, "33.900000"],
    ]);

    // A manual version from tomorrow takes precedence; later Shopify syncs leave it alone.
    await db.update(schema.variantCostVersion).set({ effectiveTo: "2026-10-19" }).where(eq(schema.variantCostVersion.effectiveFrom, "2026-10-18"));
    await db.insert(schema.variantCostVersion).values({ storeId: conn.storeId, variantId: versions[0]!.variantId, effectiveFrom: "2026-10-19", currency: "AUD", productCost: "30.00", source: "manual" });
    state.products = [product("35.00")];
    await sync.incremental(conn.storeId);
    const after = await db.select().from(schema.variantCostVersion).orderBy(schema.variantCostVersion.effectiveFrom);
    expect(after.at(-1)).toMatchObject({ source: "manual", productCost: "30.000000", effectiveTo: null });
    expect(after).toHaveLength(3);
  });

  it("reconciles daily order counts with Shopify and records mismatches", async () => {
    const { conn, sync, state } = await setup();
    await sync.backfill(conn.storeId);
    state.ordersCount = 2; // Shopify says 2 orders each day; we have 1 order on 3 Oct only
    const r = await sync.reconcileOrderCounts(conn.storeId, 15);
    expect(r.mismatches.find((m) => m.date === "2026-10-03")).toEqual({ date: "2026-10-03", shopify: 2, ours: 1 });
    expect((await db.select().from(schema.reconciliationIssue)).length).toBe(r.mismatches.length);
  });

  it("reuses a valid stored token instead of requesting a new one per run", async () => {
    const { conn, sync, state } = await setup();
    expect(state.tokenRequests).toBe(1); // during connect
    await sync.incremental(conn.storeId);
    await sync.incremental(conn.storeId);
    expect(state.tokenRequests).toBe(1);
  });

  // ---------------------------------------------------------------- profit engine on stored facts (Phase 5)

  const money = (v: string | null | undefined) => (v === null || v === undefined ? v : dec(v).toFixed(2));

  it("backfill computes the order result, per-day rows, COGS lines and the store aggregate; a re-run is a no-op", async () => {
    const { conn, sync } = await setup();
    const r = await sync.backfill(conn.storeId);
    expect(r.stats.ordersRecalculated).toBe(1);

    const [p] = await db.select().from(schema.orderProfit);
    expect(p).toMatchObject({ included: true, isComplete: false, engineVersion: ENGINE_VERSION, policyVersion: 1 });
    expect(p!.missingComponents).toEqual(["chargeback_fee", "cogs", "shipping"]); // socks have no cost, no shipping rule, no dispute fee
    expect(money(p!.cogs)).toBe("31.20"); // 2 sneakers × 31.20 − 1 returned & restocked
    expect(money(p!.chargebacks)).toBe("159.88"); // lost chargeback, capped at the money still held after the refund

    const days = await db.select().from(schema.orderDailyResult).orderBy(schema.orderDailyResult.localDate);
    expect(days.map((d) => d.localDate)).toEqual(["2026-10-03", "2026-10-04", "2026-10-08", "2026-10-12"]); // order, edit, refund, chargeback (Sydney dates)
    expect(days.map((d) => money(d.cogs))).toEqual(["62.40", "0.00", "-31.20", "0.00"]);
    expect(days[0]!.ordersMissingCogs).toBe(1);
    expect(sum(days.map((d) => dec(d.revenue))).toFixed(2)).toBe(money(p!.revenue));
    const lines = await db.select().from(schema.orderCogsLine).orderBy(schema.orderCogsLine.localDate, schema.orderCogsLine.kind);
    expect(lines.map((l) => [l.kind, l.quantity, l.status, money(l.amount)])).toEqual(
      expect.arrayContaining([["sale", 2, "actual", "62.40"], ["reversal", -1, "actual", "-31.20"], ["sale", 1, "missing", "0.00"]]),
    );

    const agg = await db.select().from(schema.dailyStoreMetrics).orderBy(schema.dailyStoreMetrics.localDate);
    expect(agg.map((d) => d.localDate)).toEqual(days.map((d) => d.localDate));
    expect(agg.map((d) => money(d.revenue))).toEqual(days.map((d) => money(d.revenue)));
    expect(money(agg[3]!.chargebackLoss)).toBe("159.88");

    const profit = new ProfitService(db);
    expect(await profit.reconcileAmounts(conn.storeId, "2026-10-01", "2026-10-17")).toEqual([]);
    expect(await profit.recalcStore(conn.storeId)).toMatchObject({ computed: 0, unchanged: 1 });
  });

  it("recalculates only what a cost or policy change affects; reconciliation catches a corrupted aggregate", async () => {
    const { conn, sync } = await setup();
    await sync.backfill(conn.storeId);
    const profit = new ProfitService(db);

    // A cost for the socks completes COGS for the orders containing them.
    const [socks] = await db.select().from(schema.variant).where(eq(schema.variant.shopifyGid, "gid://shopify/ProductVariant/21"));
    await db.insert(schema.variantCostVersion).values({ storeId: conn.storeId, variantId: socks!.id, effectiveFrom: "2026-01-01", currency: "AUD", productCost: "4.50", source: "manual" });
    const affected = await profit.ordersWithVariants(conn.storeId, [socks!.id], "2026-01-01");
    expect(affected).toHaveLength(1);
    expect(await profit.recalcOrders(conn.storeId, affected)).toMatchObject({ computed: 1, daysAggregated: 4 });
    const [p] = await db.select().from(schema.orderProfit);
    expect(money(p!.cogs)).toBe("40.20"); // + 2 socks × 4.50
    expect(p!.missingComponents).not.toContain("cogs");

    // A new policy version restates refunds onto the order date: the refund day disappears.
    await db.insert(schema.financialPolicy).values({ storeId: conn.storeId, version: 2, settings: { ...DEFAULT_POLICY, refundDating: "order" } as unknown as Record<string, unknown> });
    expect(await profit.recalcStore(conn.storeId)).toMatchObject({ computed: 1 });
    const days = (await db.select({ d: schema.dailyStoreMetrics.localDate }).from(schema.dailyStoreMetrics)).map((r) => r.d).sort();
    expect(days).toEqual(["2026-10-03", "2026-10-04", "2026-10-12"]);
    expect(await profit.reconcileAmounts(conn.storeId, "2026-10-01", "2026-10-17")).toEqual([]); // skipped: not event-dated

    await db.insert(schema.financialPolicy).values({ storeId: conn.storeId, version: 3, settings: DEFAULT_POLICY as unknown as Record<string, unknown> });
    await profit.recalcStore(conn.storeId);
    await db.execute(sql`update daily_store_metrics set gross_sales = gross_sales + 5 where local_date = '2026-10-03'`);
    const issues = await profit.reconcileAmounts(conn.storeId, "2026-10-01", "2026-10-17");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ date: "2026-10-03", metric: "gross_sales" });
    expect(money(issues[0]!.difference)).toBe("-5.00");
    expect(await db.select().from(schema.reconciliationIssue)).toHaveLength(1);
  });

  it("live reporting source: aggregates + expenses and ad spend on read, orders, products, tenant isolation", async () => {
    const { conn, scope, sync } = await setup();
    await sync.backfill(conn.storeId);
    const range = { start: "2026-10-01", end: "2026-10-31" };
    // A monthly expense spread over October, a per-order expense, and a manual ad-spend entry.
    await db.insert(schema.expense).values([
      { organizationId: scope.organizationId, storeId: conn.storeId, name: "Apps", type: "recurring", frequency: "monthly", allocation: "spread", amount: "310", currency: "AUD", startDate: "2026-10-01" },
      { organizationId: scope.organizationId, storeId: conn.storeId, name: "Packaging", type: "per_order", amount: "1.50", currency: "AUD", startDate: "2026-01-01" },
    ]);
    const [acct] = await db.insert(schema.adAccount).values({ organizationId: scope.organizationId, platform: "manual", externalId: "manual:1", name: "Manual", currency: "AUD", timezone: "Australia/Sydney", storeId: conn.storeId }).returning();
    await db.insert(schema.adSpendDaily).values({ adAccountId: acct!.id, level: "account", entityExternalId: "manual:1", date: "2026-10-03", source: "manual", spend: "40" });

    const source = new DbReportingDataSource(db, scope.organizationId);
    const days = await source.getDailyComponents(conn.storeId, range);
    expect(days).toHaveLength(31);
    const total = (k: "revenue" | "fixedExpenses" | "variableExpenses" | "adSpend") => sum(days.map((d) => dec(d[k]))).toFixed(2);
    const [p] = await db.select().from(schema.orderProfit);
    expect(total("revenue")).toBe(money(p!.revenue));
    expect(total("fixedExpenses")).toBe("310.00");
    expect(total("variableExpenses")).toBe("1.50"); // one order
    expect(total("adSpend")).toBe("40.00");
    expect(days.find((d) => d.localDate === "2026-10-03")!.newCustomers).toBe(1);

    const dashboard = await new ReportingService(source).dashboard(conn.storeId, range, "none");
    expect(dashboard!.completeness).toMatchObject({ complete: false, ordersMissingCogs: 1, ordersMissingShipping: 1 });
    expect(dashboard!.adChannels).toEqual([expect.objectContaining({ channel: "manual:manual", spend: "40.000000" })]);

    const orders = await source.listOrders(conn.storeId, { range, search: "5001" });
    expect(orders.total).toBe(1);
    expect(orders.rows[0]).toMatchObject({ name: "#5001", financialStatus: "partially_refunded", cogs: "31.200000", isComplete: false });
    const detail = await source.getOrder(conn.storeId, orders.rows[0]!.id);
    expect(detail!.breakdown.map((b) => b.key)).toEqual(expect.arrayContaining(["grossSales", "cogs", "shippingCost", "returns", "cogsReversal", "chargebackLoss"]));
    expect(detail!.breakdown.find((b) => b.key === "cogsReversal")).toMatchObject({ amount: "31.200000", date: "2026-10-08" });
    expect(detail!.lineItems.find((l) => l.sku === "SOCK")).toMatchObject({ unitCost: null, costStatus: "missing" });

    const products = await source.listProducts(conn.storeId, range);
    expect(products.find((x) => x.sku === "SNK-8")).toMatchObject({ unitsSold: 1, cogs: "31.200000", costStatus: "actual" });
    expect(products.find((x) => x.sku === "SOCK")).toMatchObject({ unitsSold: 2, cogs: "0.000000", costStatus: "missing" });

    // Product daily rows add up to the product report (net sales, units, COGS) for the same range.
    const sneaker = products.find((x) => x.sku === "SNK-8")!;
    const variantsOfProduct = products.filter((x) => x.productId === sneaker.productId);
    const daily = await source.getProductDaily(conn.storeId, sneaker.productId, range);
    expect(sum(daily.map((d) => dec(d.netSales))).toFixed(2)).toBe(sum(variantsOfProduct.map((x) => dec(x.netSales))).toFixed(2));
    expect(sum(daily.map((d) => dec(d.cogs))).toFixed(2)).toBe(sum(variantsOfProduct.map((x) => dec(x.cogs))).toFixed(2));
    expect(daily.reduce((n, d) => n + d.unitsSold, 0)).toBe(variantsOfProduct.reduce((n, x) => n + x.unitsSold, 0));

    // Customers: the one customer is new in October; event-dated revenue (with the refund) matches the order.
    const activity = await source.getCustomerActivity(conn.storeId, range.end);
    expect(activity.historyComplete).toBe(false); // read_all_orders not granted
    expect(sum(activity.rows.map((r) => dec(r.revenue))).toFixed(2)).toBe(money(p!.revenue));
    expect(activity.rows.every((r) => r.customerId !== null && r.firstOrderDate === "2026-10-03")).toBe(true);
    const customers = (await new ReportingService(source).customers(conn.storeId, range))!;
    expect(customers.period).toMatchObject({ customers: 1, newCustomers: 1, returningCustomers: 0, orders: 1, guestOrders: 0, cac: "40.000000" });
    expect(customers.cohorts.map((c) => [c.month, c.customers])).toEqual([["2026-10", 1]]);
    expect(customers.toDate.revenueMissingCogsShare).not.toBeNull(); // SOCK has no cost

    // UTM groups hold all event-dated revenue; the order profit matches the stored order result.
    const utm = await source.getUtmPerformance(conn.storeId, range);
    expect(sum(utm.map((u) => dec(u.revenue))).toFixed(2)).toBe(money(p!.revenue));
    expect(sum(utm.map((u) => dec(u.orderProfit))).toFixed(2)).toBe(money(p!.profit));
    expect(utm.reduce((n, u) => n + u.orders, 0)).toBe(1);

    // Another organization sees nothing and cannot read the store.
    const other = await seedOrg("other");
    const foreign = new DbReportingDataSource(db, other.organizationId);
    await expect(foreign.getCustomerActivity(conn.storeId, range.end)).rejects.toThrow();
    await expect(foreign.getUtmPerformance(conn.storeId, range)).rejects.toThrow();
    await expect(foreign.getCampaignSpend(conn.storeId, range)).rejects.toThrow();
    expect(await foreign.listStores()).toEqual([]);
    await expect(foreign.getDailyComponents(conn.storeId, range)).rejects.toThrow();
    await expect(foreign.listOrders(conn.storeId, { range })).rejects.toThrow();
  });

  it("cost service: dated product costs split history, recalculate affected orders and are audited", async () => {
    const { conn, scope, sync } = await setup();
    await sync.backfill(conn.storeId);
    const profit = new ProfitService(db);
    const [socks] = await db.select().from(schema.variant).where(eq(schema.variant.shopifyGid, "gid://shopify/ProductVariant/21"));
    const [sneaker] = await db.select().from(schema.variant).where(eq(schema.variant.shopifyGid, "gid://shopify/ProductVariant/11"));

    const list = await listVariantCosts(db, scope, conn.storeId, { missingOnly: true });
    expect(list).toMatchObject({ total: 1, missingTotal: 1, missingSold: 1 });
    expect(list.rows[0]).toMatchObject({ sku: "SOCK", current: null, unitsOrdered: 2 });

    // Socks cost 4.50 + 0.50 inbound for all history.
    const r1 = await setVariantCost(db, scope, conn.storeId, { variantIds: [socks!.id], productCost: "4.50", inboundShipping: "0.50", effectiveFrom: "2000-01-01" });
    expect(await applyRecalc(profit, null, conn.storeId, r1)).toEqual({ mode: "inline", orders: 1 });
    expect(money((await db.select().from(schema.orderProfit))[0]!.cogs)).toBe("41.20"); // 31.20 + 2 × 5.00

    // Sneaker gets a new cost from 2026-10-04: the Shopify-seeded version is closed, older orders keep 31.20.
    await setVariantCost(db, scope, conn.storeId, { variantIds: [sneaker!.id], productCost: "35.00", effectiveFrom: "2026-10-04" });
    const history = await variantCostHistory(db, scope, conn.storeId, sneaker!.id);
    expect(history.map((h) => [h.effectiveFrom, h.effectiveTo, h.source])).toEqual([["2026-10-04", null, "manual"], ["2000-01-01", "2026-10-04", "shopify_sync"]]);
    // A cost set on an earlier date stops at the next version instead of overwriting it.
    await setVariantCost(db, scope, conn.storeId, { variantIds: [sneaker!.id], productCost: "30.00", effectiveFrom: "2026-09-01" });
    expect((await variantCostHistory(db, scope, conn.storeId, sneaker!.id)).map((h) => [h.effectiveFrom, h.effectiveTo])).toEqual([["2026-10-04", null], ["2026-09-01", "2026-10-04"], ["2000-01-01", "2026-09-01"]]);
    expect((await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "cost_version.set"))).length).toBe(3);

    // One handling mode: per-unit handling in product costs blocks handling rules.
    await setVariantCost(db, scope, conn.storeId, { variantIds: [socks!.id], productCost: "4.50", handling: "0.20", effectiveFrom: "2026-01-01" });
    await expect(saveHandlingRule(db, scope, conn.storeId, { mode: "per_order", amount: "1.00", effectiveFrom: "2026-01-01" })).rejects.toBeInstanceOf(CostInputError);

    // Viewers cannot change costs; other organizations cannot see the store.
    await expect(setVariantCost(db, { ...scope, role: "viewer" }, conn.storeId, { variantIds: [socks!.id], productCost: "1", effectiveFrom: "2026-01-01" })).rejects.toThrow(/permission/);
    const other = await seedOrg("other");
    await expect(listVariantCosts(db, other, conn.storeId, {})).rejects.toThrow();
    await expect(setVariantCost(db, scope, conn.storeId, { variantIds: [socks!.id], productCost: "-1", effectiveFrom: "2026-01-01" })).rejects.toThrow();
  });

  it("cost service: CSV import previews a diff, skips bad rows and applies by SKU; export round-trips", async () => {
    const { conn, scope, sync } = await setup();
    await sync.backfill(conn.storeId);
    const csv = ["SKU,Product Cost,Effective From", "SOCK,4.50,", "snk-8,$33.00,2026-10-01", "NOPE,1.00,", "SOCK,abc,2026-02-01", "SOCK,,"].join("\n");
    const preview = await previewCostImport(db, scope, conn.storeId, csv);
    expect(preview.matched.map((m) => [m.label, m.productCost, m.effectiveFrom, m.previous])).toEqual([
      ["Sneaker — Default", "4.50", "2000-01-01", null], // the fixture's socks are a variant of the same product
      ["Sneaker — Black / 8", "33.00", "2026-10-01", "31.200000"],
    ]);
    expect(preview.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(preview.blank).toBe(1); // rows without a cost are ignored, not errors
    const applied = await applyCostImport(db, scope, conn.storeId, csv);
    expect(applied).toMatchObject({ applied: 2, skipped: 2 });
    await applyRecalc(new ProfitService(db), null, conn.storeId, applied);
    const [p] = await db.select().from(schema.orderProfit);
    expect(money(p!.cogs)).toBe("42.00"); // order on 2026-10-03: 2 × 33.00 − 1 × 33.00 + 2 × 4.50
    const exported = await exportCostsCsv(db, scope, conn.storeId);
    expect(exported.split("\n")[0]).toBe("variant_id,sku,product,variant,price,product_cost,inbound_shipping,handling,effective_from");
    expect(exported).toContain(",SOCK,");
    // An export re-imports as is (here: no changes, every row matches its variant).
    const reimport = await previewCostImport(db, scope, conn.storeId, exported);
    expect(reimport.errors).toEqual([]);
    expect(reimport.matched).toHaveLength(2);
    await expect(previewCostImport(db, scope, conn.storeId, "name,price\nx,1")).rejects.toBeInstanceOf(CostInputError);
  });

  it("cost service: shipping, fee and policy changes recalculate; policy versions are kept", async () => {
    const { conn, scope, sync } = await setup();
    await sync.backfill(conn.storeId);
    const profit = new ProfitService(db);
    const ship = await saveShippingRule(db, scope, conn.storeId, null, { name: "AU", params: { type: "first_plus_additional", first: "8.00", additional: "1.00" }, countryCodes: ["au"], effectiveFrom: "2026-01-01" });
    expect(ship.affectedOrderIds).toHaveLength(1);
    await applyRecalc(profit, null, conn.storeId, ship);
    const [p1] = await db.select().from(schema.orderProfit);
    expect(money(p1!.shippingCost)).toBe("11.00"); // 4 shippable units: 8 + 3 × 1
    expect(p1!.missingComponents).not.toContain("shipping");
    await expect(saveShippingRule(db, scope, conn.storeId, null, { name: "bad", params: { type: "per_order", amount: "1" }, effectiveFrom: "2026-02-01", effectiveTo: "2026-01-01" })).rejects.toThrow();

    // A weight rule (higher priority) prices by the variants' weights; a missing weight is flagged, never guessed.
    const variantWeights = async (grams: number | null) => {
      await db.update(schema.variant).set({ weightGrams: grams }).where(eq(schema.variant.storeId, conn.storeId));
    };
    await variantWeights(400);
    const byWeight = await saveShippingRule(db, scope, conn.storeId, null, {
      name: "Weight",
      params: { type: "tiered_weight", tiers: [{ minGrams: 0, amount: "9.00" }, { minGrams: 1500, amount: "14.00" }] },
      priority: 1,
      effectiveFrom: "2026-01-01",
    });
    await applyRecalc(profit, null, conn.storeId, byWeight);
    const [pw] = await db.select().from(schema.orderProfit);
    expect(money(pw!.shippingCost)).toBe("14.00"); // 4 units × 400 g = 1,600 g
    await variantWeights(0); // Shopify's "no weight entered"
    await profit.recalcStore(conn.storeId);
    const [pm] = await db.select().from(schema.orderProfit);
    expect(pm!.missingComponents).toContain("shipping");
    await expect(
      saveShippingRule(db, scope, conn.storeId, null, { name: "bad kg", params: { type: "tiered_weight", tiers: [{ minGrams: Number.NaN, amount: "1" }] }, effectiveFrom: "2026-01-01" }),
    ).rejects.toThrow(/kg like 0.5/);
    const [weightRule] = await db.select().from(schema.shippingRule).where(eq(schema.shippingRule.name, "Weight"));
    await deleteShippingRule(db, scope, conn.storeId, weightRule!.id);
    await variantWeights(400);
    await profit.recalcStore(conn.storeId);

    expect(await gatewaySummary(db, scope, conn.storeId)).toEqual([expect.objectContaining({ gateway: "shopify_payments", payments: 1, with_actual_fees: 1 })]);
    await saveGatewayRule(db, scope, conn.storeId, { gateway: "paypal", percentRate: "2.6", fixedFee: "0.30", thirdPartyFeeApplies: true, effectiveFrom: "2026-01-01" });
    await expect(saveGatewayRule(db, scope, conn.storeId, { gateway: "PayPal", percentRate: "3", fixedFee: "0", thirdPartyFeeApplies: true, effectiveFrom: "2026-06-01" })).rejects.toBeInstanceOf(CostInputError);
    // Invalid input is a validation error with a readable message, never a crash.
    for (const [percentRate, message] of [["abc", "Enter a percentage like 2.9."], ["101", "A percentage cannot exceed 100."]]) {
      const err = await saveGatewayRule(db, scope, conn.storeId, { gateway: "stripe", percentRate: percentRate!, fixedFee: "0", thirdPartyFeeApplies: false, effectiveFrom: "2026-01-01" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ZodError);
      expect((err as ZodError).issues[0]!.message).toBe(message);
    }

    const before = await getPolicy(db, scope, conn.storeId);
    expect(before.version).toBe(1);
    await expect(savePolicy(db, { ...scope, role: "editor" }, conn.storeId, { ...before.policy, refundDating: "order" })).rejects.toThrow(/permission/);
    const saved = await savePolicy(db, scope, conn.storeId, { ...before.policy, refundDating: "order" });
    expect(saved).toMatchObject({ version: 2, wholeStore: true });
    expect(await applyRecalc(profit, null, conn.storeId, saved)).toMatchObject({ mode: "inline", orders: 1 });
    expect((await savePolicy(db, scope, conn.storeId, { ...before.policy, refundDating: "order" })).version).toBe(2); // unchanged → no new version
    expect((await getPolicy(db, scope, conn.storeId)).history.map((h) => h.version)).toEqual([2, 1]);
    await expect(savePolicy(db, scope, conn.storeId, { ...before.policy, refundDating: "never" })).rejects.toThrow();

    // Expenses: saved without recalculation (applied on read).
    expect(await saveExpense(db, scope, conn.storeId, null, { name: "Shopify plan", type: "recurring", frequency: "monthly", amount: "39", currency: "aud", startDate: "2026-10-01" })).toEqual({ affectedOrderIds: [] });
    await expect(saveExpense(db, scope, conn.storeId, null, { name: "x", type: "recurring", amount: "39", currency: "AUD", startDate: "2026-10-01" })).rejects.toThrow();
    const [e] = await listExpenses(db, scope, conn.storeId);
    expect(e!.e).toMatchObject({ currency: "AUD", frequency: "monthly", percent: null });
    await archiveExpense(db, scope, conn.storeId, e!.e.id);
    expect(await listExpenses(db, scope, conn.storeId)).toHaveLength(0);
  });

  it("an incremental sync recalculates the orders it changed", async () => {
    const { conn, sync, state } = await setup();
    await sync.backfill(conn.storeId);
    const unchanged = await sync.incremental(conn.storeId);
    expect(unchanged.stats.ordersRecalculated).toBe(0); // same facts → same inputs hash
    const newer = pagedOrder();
    newer.updatedAt = "2026-10-12T00:00:00Z";
    newer.test = true;
    state.orders = [newer];
    expect((await sync.incremental(conn.storeId)).stats.ordersRecalculated).toBe(1);
    const [p] = await db.select().from(schema.orderProfit);
    expect(p).toMatchObject({ included: false, exclusionReason: "test order" });
    expect(await db.select().from(schema.dailyStoreMetrics)).toHaveLength(0);
  });
});

describe("Shopify webhooks", () => {
  const setupStore = async () => {
    const state = { orders: [], products: [], scopes: ALL_SCOPES, ordersCount: 0, tokenRequests: 0 };
    const deps = { db, keyring, apiVersion: "2026-10", fetch: fakeShopify(state) };
    const scope = await seedOrg("wh");
    const conn = await connectStoreWithClientCredentials(deps, scope, { shopDomain: SHOP, clientId: "client-id-123", clientSecret: "shpss_webhook_secret" });
    const sent: { name: string; data: unknown; key?: string }[] = [];
    const jobs = { send: async (name: string, data?: object | null, opts?: { singletonKey?: string }) => (sent.push({ name, data, ...(opts?.singletonKey ? { key: opts.singletonKey } : {}) }), "job-1") };
    return { conn, sent, wh: { db, keyring, jobs } };
  };
  const deliver = (wh: Parameters<typeof handleShopifyWebhook>[0], topic: string, body: object, opts: { id?: string; secret?: string; shop?: string } = {}) => {
    const raw = Buffer.from(JSON.stringify(body));
    const h: Record<string, string> = {
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": opts.shop ?? SHOP,
      "x-shopify-webhook-id": opts.id ?? `wh-${Math.random()}`,
      "x-shopify-hmac-sha256": createHmac("sha256", opts.secret ?? "shpss_webhook_secret").update(raw).digest("base64"),
    };
    return handleShopifyWebhook(wh, raw, (n) => h[n] ?? null);
  };

  it("verifies signatures, dedupes deliveries and enqueues an authoritative order refresh", async () => {
    const { wh, sent } = await setupStore();
    const body = { id: 5001, admin_graphql_api_id: "gid://shopify/Order/5001", total_price: "10.00" };
    expect(await deliver(wh, "orders/updated", body, { secret: "wrong" })).toEqual({ status: 401, outcome: "invalid_signature" });
    expect(await deliver(wh, "orders/updated", body, { id: "w-1" })).toEqual({ status: 200, outcome: "enqueued_order" });
    expect(await deliver(wh, "orders/updated", body, { id: "w-1" })).toEqual({ status: 200, outcome: "duplicate" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ name: "shopify.order", data: { orderGid: "gid://shopify/Order/5001" } });
    expect(await deliver(wh, "refunds/create", { id: 9, order_id: 5001 })).toMatchObject({ outcome: "enqueued_order" });
    expect(await deliver(wh, "products/update", { id: 10 })).toMatchObject({ outcome: "enqueued_sync" });
    expect(await deliver(wh, "orders/updated", body, { shop: "other-store.myshopify.com" })).toEqual({ status: 200, outcome: "unknown_shop" });
  });

  it("handles uninstall and shop redaction (erases all store data)", async () => {
    const { wh, conn } = await setupStore();
    expect(await deliver(wh, "app/uninstalled", { id: 1 })).toMatchObject({ outcome: "uninstalled" });
    const [c] = await db.select().from(schema.storeConnection);
    expect(c!.status).toBe("revoked");
    expect(await deliver(wh, "shop/redact", { shop_id: 1, shop_domain: SHOP })).toMatchObject({ outcome: "redacted_shop" });
    expect(await db.select().from(schema.store).where(eq(schema.store.id, conn.storeId))).toHaveLength(0);
    expect((await db.select().from(schema.auditLog)).map((a) => a.action)).toEqual(expect.arrayContaining(["store.uninstalled", "store.redacted"]));
  });
});

describe("store-local day bounds", () => {
  it("handles DST transitions (Sydney DST starts 2026-10-04: a 23-hour day)", () => {
    expect(dayBoundsUtc("2026-10-03", "Australia/Sydney")).toEqual({ fromIso: "2026-10-02T14:00:00.000Z", toIso: "2026-10-03T14:00:00.000Z" });
    const dst = dayBoundsUtc("2026-10-04", "Australia/Sydney");
    expect(dst).toEqual({ fromIso: "2026-10-03T14:00:00.000Z", toIso: "2026-10-04T13:00:00.000Z" });
    expect(dayBoundsUtc("2026-10-18", "America/New_York")).toEqual({ fromIso: "2026-10-18T04:00:00.000Z", toIso: "2026-10-19T04:00:00.000Z" });
  });
});
