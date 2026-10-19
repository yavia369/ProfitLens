import { randomBytes } from "node:crypto";
import { createDb, createPool, schema, type Database, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectPaymentGateway, listPaymentConnections, listUnmatchedGatewayPayments, syncPaymentGateway } from "../src/payments";
import { ProfitService } from "../src/profit";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
const keyring = { keys: { k1: randomBytes(32).toString("base64") }, activeKid: "k1" };
const NOW = new Date("2026-10-19T03:00:00Z");
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "payments"), 4);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "organization", "user" RESTART IDENTITY CASCADE`);
});

/** A store with orders paid through PayPal (Shopify reports no fee for them). */
async function seed(): Promise<{ scope: OrgScope; storeId: string; orders: Record<string, string> }> {
  const userId = `u-${Math.random()}`;
  await db.insert(schema.user).values({ id: userId, name: "Owner", email: `${userId}@example.com` });
  const [org] = await db.insert(schema.organization).values({ name: "Owner" }).returning();
  await db.insert(schema.membership).values({ organizationId: org!.id, userId, role: "owner" });
  const [st] = await db
    .insert(schema.store)
    .values({ organizationId: org!.id, shopDomain: `p-${Math.floor(Math.random() * 1e9)}.myshopify.com`, name: "Store", currency: "AUD", ianaTimezone: "Australia/Sydney", status: "active", thirdPartyFeeRate: "2" })
    .returning();
  await db.insert(schema.financialPolicy).values({ storeId: st!.id, version: 1, settings: {} });
  const orders: Record<string, string> = {};
  // name, paid at, amount
  for (const [name, at, amount] of [
    ["#A", "2026-10-14T10:00:00Z", "100.00"],
    ["#B", "2026-10-15T09:00:00Z", "50.00"],
    ["#C", "2026-10-15T09:05:00Z", "50.00"], // same amount 5 minutes later: ambiguous for a 50.00 PayPal payment
  ] as const) {
    const [o] = await db
      .insert(schema.order)
      .values({ storeId: st!.id, shopifyGid: `gid://shopify/Order/${name}`, name, createdAtShopify: new Date(at), processedAt: new Date(at), processedLocalDate: at.slice(0, 10), currency: "AUD", financialStatus: "PAID", shopifyUpdatedAt: new Date(at) })
      .returning();
    orders[name] = o!.id;
    await db.insert(schema.saleLedgerEntry).values({
      storeId: st!.id, orderId: o!.id, saleGid: `gid://shopify/Sale/${name}`, agreementGid: `gid://shopify/SalesAgreement/${name}`, agreementType: "OrderAgreement",
      happenedAt: new Date(at), happenedLocalDate: at.slice(0, 10), actionType: "ORDER", lineType: "SHIPPING", totalAmount: amount, totalTaxAmount: "0", totalDiscountBeforeTaxes: "0", totalDiscountAfterTaxes: "0",
    });
    await db.insert(schema.paymentTransaction).values({ storeId: st!.id, orderId: o!.id, shopifyGid: `gid://shopify/OrderTransaction/${name}`, kind: "SALE", status: "SUCCESS", gateway: "paypal", amount, currency: "AUD", processedAt: new Date(at), processedLocalDate: at.slice(0, 10) });
  }
  await new ProfitService(db).recalcStore(st!.id);
  return { scope: { userId, organizationId: org!.id, role: "owner" }, storeId: st!.id, orders };
}

function fakePayPal(rows: { id: string; at: string; amount: string; fee?: string; currency?: string }[]) {
  const calls: string[] = [];
  const f = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push(url);
    const respond = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (url.endsWith("/v1/oauth2/token")) {
      return init.headers.Authorization === `Basic ${Buffer.from("client-id-1234:client-secret-1234").toString("base64")}`
        ? respond(200, { access_token: "A21AA-token", expires_in: 32400 })
        : respond(401, { error: "invalid_client", error_description: "Client Authentication failed" });
    }
    const u = new URL(url);
    const from = new Date(u.searchParams.get("start_date")!).getTime();
    const to = new Date(u.searchParams.get("end_date")!).getTime();
    const details = rows
      .filter((r) => new Date(r.at).getTime() >= from && new Date(r.at).getTime() < to)
      .map((r) => ({
        transaction_info: {
          transaction_id: r.id, transaction_event_code: "T0006", transaction_status: "S", transaction_initiation_date: r.at.replace("Z", "+0000"),
          transaction_amount: { currency_code: r.currency ?? "AUD", value: r.amount }, ...(r.fee ? { fee_amount: { currency_code: r.currency ?? "AUD", value: `-${r.fee}` } } : {}),
        },
      }));
    return respond(200, { transaction_details: details, total_pages: 1 });
  };
  return { f: f as never, calls };
}

describe("payment gateway fees (fake PayPal/Stripe, real Postgres)", () => {
  it("matches PayPal payments by amount + time; the matched fee becomes actual, ambiguous ones keep the estimate", async () => {
    const { scope, storeId, orders } = await seed();
    const pp = fakePayPal([
      { id: "9AB12345CD6789001", at: "2026-10-14T10:02:10Z", amount: "100.00", fee: "3.79" },
      { id: "9AB12345CD6789002", at: "2026-10-15T09:03:00Z", amount: "50.00", fee: "2.05" },
      { id: "9AB12345CD6789003", at: "2026-10-16T12:00:00Z", amount: "75.00", fee: "2.80" }, // not a Shopify order
    ]);
    const deps = { db, keyring, fetch: pp.f, sleep: async () => {}, now: () => NOW };
    await expect(connectPaymentGateway(deps, scope, { storeId, gateway: "paypal", clientId: "client-id-1234", clientSecret: "wrong-secret-1234" })).rejects.toMatchObject({ kind: "auth" });
    const { connectionId } = await connectPaymentGateway(deps, scope, { storeId, gateway: "paypal", clientId: "client-id-1234", clientSecret: "client-secret-1234" });
    const [conn] = await db.select().from(schema.paymentConnection);
    expect(conn!.credentialsEnc).not.toContain("client-secret-1234");

    const r = await syncPaymentGateway(deps, connectionId);
    expect(r).toMatchObject({ imported: 3, matched: 1, unmatched: 1, ambiguous: 1, ordersRecalculated: 1 });
    const profit = async (o: string) => (await db.select().from(schema.orderProfit).where(eq(schema.orderProfit.orderId, o)))[0]!;
    const a = await profit(orders["#A"]!);
    expect(a.transactionFees).toBe("5.790000"); // PayPal 3.79 + Shopify third-party 2 %
    expect(JSON.stringify(a.trace)).toContain("PayPal fee (matched 9AB12345CD6789001) + Shopify third-party fee");
    expect(a.estimatedComponents).not.toContain("transaction_fees");
    // #B and #C: 50.00 within 15 minutes of a 50.00 PayPal payment → ambiguous, nothing guessed.
    expect(JSON.stringify((await profit(orders["#B"]!)).trace)).not.toContain("PayPal fee");
    expect(JSON.stringify((await profit(orders["#C"]!)).trace)).not.toContain("PayPal fee");
    const open = await listUnmatchedGatewayPayments(db, scope, connectionId);
    expect(open.map((x) => [x.externalId, x.status])).toEqual([
      ["9AB12345CD6789003", "unmatched"],
      ["9AB12345CD6789002", "ambiguous"],
    ]);
    expect((await listPaymentConnections(db, scope))[0]).toMatchObject({ gateway: "paypal", matched: 1, open: 2, storeName: "Store" });

    // The next sync re-reads only the 72-hour overlap (PayPal lists late); earlier matches are kept, nothing recalculated.
    expect(await syncPaymentGateway(deps, connectionId)).toMatchObject({ imported: 1, unmatched: 1, ordersRecalculated: 0 });
    expect((await db.select().from(schema.gatewayTransaction).where(eq(schema.gatewayTransaction.externalId, "9AB12345CD6789001")))[0]).toMatchObject({ matchStatus: "matched", shopifyTransactionGid: "gid://shopify/OrderTransaction/#A" });
    expect(await db.select().from(schema.gatewayTransaction)).toHaveLength(3); // no duplicates
    // Another organization can't read this connection.
    await expect(listUnmatchedGatewayPayments(db, { ...scope, organizationId: "00000000-0000-0000-0000-000000000000" }, connectionId)).rejects.toThrow();
  });

  it("converts a fee in another currency with stored rates, and skips it without a rate", async () => {
    const { scope, storeId, orders } = await seed();
    const pp = fakePayPal([{ id: "9AB12345CD6789011", at: "2026-10-14T10:01:00Z", amount: "100.00", fee: "2.00", currency: "AUD" }]);
    const deps = { db, keyring, fetch: pp.f, sleep: async () => {}, now: () => NOW };
    const { connectionId } = await connectPaymentGateway(deps, scope, { storeId, gateway: "paypal", clientId: "client-id-1234", clientSecret: "client-secret-1234" });
    await syncPaymentGateway(deps, connectionId);
    // Pretend PayPal charged the fee in USD: without a USD rate the fee is not used.
    await db.update(schema.gatewayTransaction).set({ feeCurrency: "USD" });
    await new ProfitService(db).recalcOrders(storeId, [orders["#A"]!]);
    const before = (await db.select().from(schema.orderProfit).where(eq(schema.orderProfit.orderId, orders["#A"]!)))[0]!;
    expect(JSON.stringify(before.trace)).not.toContain("PayPal fee");
    await db.insert(schema.fxRate).values([
      { date: "2026-10-14", base: "EUR", quote: "USD", rate: "1.100000000000", source: "ecb" },
      { date: "2026-10-14", base: "EUR", quote: "AUD", rate: "1.650000000000", source: "ecb" },
    ]);
    await new ProfitService(db).recalcOrders(storeId, [orders["#A"]!]);
    const after = (await db.select().from(schema.orderProfit).where(eq(schema.orderProfit.orderId, orders["#A"]!)))[0]!;
    expect(after.transactionFees).toBe("5.000000"); // 2 USD × 1.5 = 3.00 AUD + 2.00 third-party
    expect(JSON.stringify(after.trace)).toContain("converted from USD");
  });

  it("imports Stripe charges (expanded source) and matches them the same way", async () => {
    const { scope, storeId, orders } = await seed();
    await db.update(schema.paymentTransaction).set({ gateway: "stripe" });
    const key = "rk_live_abcdefghijklmnop";
    const f = async (url: string, init: { headers: Record<string, string> }) => {
      const respond = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
      if (init.headers.Authorization !== `Bearer ${key}`) return respond(401, { error: { message: "Invalid API Key provided", type: "invalid_request_error" } });
      const u = new URL(url);
      const gte = Number(u.searchParams.get("created[gte]"));
      const created = Date.parse("2026-10-14T10:00:30Z") / 1000;
      const data = created >= gte ? [{ id: "txn_1", amount: 10000, currency: "aud", fee: 205, created, type: "charge", status: "available", exchange_rate: null, source: { id: "ch_1", object: "charge", amount: 10000, currency: "aud", created } }] : [];
      return respond(200, { object: "list", data, has_more: false });
    };
    const deps = { db, keyring, fetch: f as never, sleep: async () => {}, now: () => NOW };
    await expect(connectPaymentGateway(deps, scope, { storeId, gateway: "stripe", secretKey: "pk_live_nope" })).rejects.toThrow(/secret or restricted key/);
    const { connectionId } = await connectPaymentGateway(deps, scope, { storeId, gateway: "stripe", secretKey: key });
    expect(await syncPaymentGateway(deps, connectionId)).toMatchObject({ imported: 1, matched: 1 });
    const a = (await db.select().from(schema.orderProfit).where(eq(schema.orderProfit.orderId, orders["#A"]!)))[0]!;
    expect(a.transactionFees).toBe("4.050000"); // 2.05 Stripe + 2 % third-party
    expect(JSON.stringify(a.trace)).toContain("Stripe fee (matched txn_1)");
  });
});
