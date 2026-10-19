import { randomBytes } from "node:crypto";
import { createDb, createPool, schema, type Database, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import type { FetchLike, RawOrder, RawProduct } from "@profitlens/shopify";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { connectStoreWithClientCredentials, ConnectionError, dayBoundsUtc, handleShopifyWebhook, ShopifySyncService } from "../src/shopify";
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
