import { generateKeyPairSync, randomBytes } from "node:crypto";
import { createDb, createPool, schema, type Database, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { dec, sum } from "@profitlens/finance";
import type { FetchLike } from "@profitlens/google-ads";
import { and, eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdsSyncService, connectGoogleAdsServiceAccount, deleteManualSpend, discoverAccounts, listManualSpend, mapAdAccount, saveManualSpend, spreadAmount } from "../src/ads";
import { CostInputError, DbReportingDataSource } from "../src/profit";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
const keyring = { keys: { k1: randomBytes(32).toString("base64") }, activeKid: "k1" };
const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const KEY = JSON.stringify({ type: "service_account", project_id: "pl", client_email: "reader@pl.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });
const NOW = new Date("2026-10-19T03:00:00Z"); // 2026-10-19 in Sydney
const MANAGER = "1112223333";
const AU = "4445556666";
const US = "7778889999";

let pool: pg.Pool;
let db: Database;

interface FakeState {
  accessible: string[];
  /** customerId → date → campaign rows */
  spend: Record<string, Record<string, { id: string; name: string; micros: string; value?: number }[]>>;
  failWith?: { status: number; body: unknown };
  calls: { url: string; query?: string; login?: string }[];
}

function fakeGoogle(state: FakeState): FetchLike {
  const respond = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
  return async (url, init) => {
    if (url === "https://oauth2.googleapis.com/token") return respond(200, { access_token: "ya29.test", expires_in: 3600 });
    const body = init.body ? (JSON.parse(init.body) as { query: string }) : undefined;
    state.calls.push({ url, ...(body ? { query: body.query } : {}), ...(init.headers["login-customer-id"] ? { login: init.headers["login-customer-id"] } : {}) });
    if (state.failWith) return respond(state.failWith.status, state.failWith.body);
    if (url.endsWith("customers:listAccessibleCustomers")) return respond(200, { resourceNames: state.accessible.map((id) => `customers/${id}`) });
    const customer = /customers\/(\d+)\/googleAds:searchStream/.exec(url)![1]!;
    const q = body!.query;
    if (q.includes("FROM customer_client")) {
      return respond(200, [
        {
          results: [
            { customerClient: { id: MANAGER, descriptiveName: "Agency MCC", currencyCode: "AUD", timeZone: "Australia/Sydney", manager: true, level: "0", status: "ENABLED" } },
            { customerClient: { id: AU, descriptiveName: "Luraflo AU", currencyCode: "AUD", timeZone: "Australia/Sydney", manager: false, level: "1", status: "ENABLED" } },
            { customerClient: { id: US, descriptiveName: "Luraflo US", currencyCode: "USD", timeZone: "America/New_York", manager: false, level: "1", status: "ENABLED" } },
          ],
        },
      ]);
    }
    if (q.includes("FROM customer ")) {
      const info: Record<string, object> = { [MANAGER]: { id: MANAGER, descriptiveName: "Agency MCC", currencyCode: "AUD", timeZone: "Australia/Sydney", manager: true } };
      return respond(200, [{ results: info[customer] ? [{ customer: info[customer] }] : [] }]);
    }
    const [, from, to] = /BETWEEN '([\d-]+)' AND '([\d-]+)'/.exec(q)!;
    const results = Object.entries(state.spend[customer] ?? {})
      .filter(([d]) => d >= from! && d <= to!)
      .flatMap(([date, rows]) =>
        rows.map((r) => ({ campaign: { id: r.id, name: r.name, status: "ENABLED", advertisingChannelType: "SEARCH" }, segments: { date }, metrics: { costMicros: r.micros, clicks: "3", ...(r.value ? { conversionsValue: r.value } : {}) } })),
      );
    return respond(200, results.length ? [{ results }] : []);
  };
}

async function seed(name: string): Promise<{ scope: OrgScope; storeId: string }> {
  const userId = `user-${name}-${Date.now()}-${Math.random()}`;
  await db.insert(schema.user).values({ id: userId, name, email: `${userId}@example.com` });
  const [org] = await db.insert(schema.organization).values({ name }).returning();
  await db.insert(schema.membership).values({ organizationId: org!.id, userId, role: "owner" });
  const [st] = await db
    .insert(schema.store)
    .values({ organizationId: org!.id, shopDomain: `${name.toLowerCase()}-${Math.floor(Math.random() * 1e9)}.myshopify.com`, name, currency: "AUD", ianaTimezone: "Australia/Sydney", status: "active" })
    .returning();
  return { scope: { userId, organizationId: org!.id, role: "owner" }, storeId: st!.id };
}

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "ads"), 4);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "organization", "user" RESTART IDENTITY CASCADE`);
});

describe("Google Ads connection, mapping and spend sync (fake Google, real Postgres)", () => {
  const setup = async () => {
    const state: FakeState = {
      accessible: [MANAGER],
      spend: { [AU]: { "2026-10-17": [{ id: "11", name: "Brand", micros: "12500000", value: 89.99 }, { id: "12", name: "PMax", micros: "30000000" }], "2026-10-18": [{ id: "11", name: "Brand", micros: "10000000" }], "2024-01-05": [{ id: "11", name: "Brand", micros: "5000000" }] } },
      calls: [],
    };
    const deps = { db, keyring, fetch: fakeGoogle(state), sleep: async () => {}, now: () => NOW };
    const { scope, storeId } = await seed("Owner");
    return { state, deps, scope, storeId };
  };

  it("connects with a service account key, stores it encrypted and discovers a manager's accounts", async () => {
    const { deps, scope, state, storeId } = await setup();
    const r = await connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY, loginCustomerId: "111-222-3333" });
    expect(r.serviceAccountEmail).toBe("reader@pl.iam.gserviceaccount.com");
    expect(r.accounts.map((a) => [a.customerId, a.isManager, a.currency, a.timezone]).sort()).toEqual([
      [MANAGER, true, "AUD", "Australia/Sydney"],
      [AU, false, "AUD", "Australia/Sydney"],
      [US, false, "USD", "America/New_York"],
    ]);
    expect(state.calls.filter((c) => c.query).every((c) => c.login === MANAGER)).toBe(true);
    const dump = JSON.stringify((await db.execute(sql`select * from ad_connection`)).rows);
    expect(dump).not.toContain("BEGIN PRIVATE KEY");
    expect(dump).toContain("service_account");
    expect((await db.select().from(schema.auditLog))[0]).toMatchObject({ action: "ads.connect" });
    // Reconnecting keeps mappings.
    const au = r.accounts.find((a) => a.customerId === AU)!;
    const other = await seed("Second");
    await expect(mapAdAccount(db, scope, au.id, { storeId: other.storeId, syncEnabled: true })).rejects.toThrow(); // store of another org
    await mapAdAccount(db, scope, au.id, { storeId, syncEnabled: true });
    await discoverAccounts(deps, scope, r.connectionId);
    expect((await db.select().from(schema.adAccount).where(eq(schema.adAccount.id, au.id)))[0]).toMatchObject({ storeId, syncEnabled: true });
  });

  it("rejects keys without access, unknown manager IDs, viewers, and invalid mappings", async () => {
    const { deps, scope, state, storeId } = await setup();
    state.accessible = [];
    await expect(connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY })).rejects.toThrow(/has no access to any Google Ads account/);
    state.accessible = [AU];
    await expect(connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY, loginCustomerId: MANAGER })).rejects.toMatchObject({ kind: "permission" });
    await expect(connectGoogleAdsServiceAccount(deps, { ...scope, role: "editor" }, { keyJson: KEY })).rejects.toThrow(/permission/);
    await expect(connectGoogleAdsServiceAccount(deps, scope, { keyJson: '{"type":"authorized_user"}' })).rejects.toThrow(/not a service account key/);
    state.accessible = [MANAGER];
    const r = await connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY, loginCustomerId: MANAGER });
    const manager = r.accounts.find((a) => a.isManager)!;
    const au = r.accounts.find((a) => a.customerId === AU)!;
    await expect(mapAdAccount(db, scope, manager.id, { storeId, syncEnabled: true })).rejects.toThrow(/Manager accounts/);
    await expect(mapAdAccount(db, scope, au.id, { storeId: null, syncEnabled: true })).rejects.toThrow(/Choose the store/);
    expect(await mapAdAccount(db, scope, au.id, { storeId, syncEnabled: true })).toEqual({ needsBackfill: true });
  });

  it("backfills 3 years in 90-day windows, then re-reads the last 3 days and records restatements", async () => {
    const { deps, scope, state, storeId } = await setup();
    const r = await connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY, loginCustomerId: MANAGER });
    const au = r.accounts.find((a) => a.customerId === AU)!;
    await mapAdAccount(db, scope, au.id, { storeId, syncEnabled: true });
    const ads = new AdsSyncService(deps);
    expect(await ads.syncableAccounts()).toEqual([au.id]);
    state.calls = [];
    const first = await ads.syncAccount(au.id);
    expect(first).toMatchObject({ from: "2023-10-20", to: "2026-10-19", stats: { rows: 4, campaigns: 2, restatedDays: 0, days: 1096 } });
    expect(state.calls).toHaveLength(13); // ceil(1096 / 90) windows
    const rows = await db.select().from(schema.adSpendDaily).where(eq(schema.adSpendDaily.adAccountId, au.id));
    expect(sum(rows.map((x) => dec(x.spend))).toFixed(2)).toBe("57.50");
    expect(rows.every((x) => x.level === "campaign" && x.source === "api")).toBe(true);
    expect((await db.select().from(schema.adAccount).where(eq(schema.adAccount.id, au.id)))[0]).toMatchObject({ spendSyncedThrough: "2026-10-19", lastError: null });
    expect((await db.select().from(schema.syncJob))[0]).toMatchObject({ kind: "ads.google.sync", status: "succeeded", storeId });

    // Google restates 18 Oct and PMax on 17 Oct drops to zero (omitted).
    state.spend[AU]!["2026-10-18"] = [{ id: "11", name: "Brand", micros: "11000000" }];
    state.spend[AU]!["2026-10-17"] = [{ id: "11", name: "Brand", micros: "12500000", value: 89.99 }];
    state.calls = [];
    const second = await ads.syncAccount(au.id);
    expect(second).toMatchObject({ from: "2026-10-16", to: "2026-10-19", stats: { restatedDays: 2 } });
    expect(state.calls).toHaveLength(1);
    const after = await db.select().from(schema.adSpendDaily).where(and(eq(schema.adSpendDaily.adAccountId, au.id), eq(schema.adSpendDaily.date, "2026-10-17")));
    expect(after.map((x) => x.spend)).toEqual(["12.500000"]);

    // Reports include it (AUD account, same time zone → no approximation flag).
    const source = new DbReportingDataSource(db, scope.organizationId);
    const days = await source.getDailyComponents(storeId, { start: "2026-10-15", end: "2026-10-19" });
    expect(sum(days.map((d) => dec(d.adSpend))).toFixed(2)).toBe("23.50");
    expect(await source.getAdSpendByChannel(storeId, { start: "2026-10-15", end: "2026-10-19" })).toEqual([
      { channel: "google_ads", label: "Google Ads", source: "api", spend: "23.500000", platformConversionValue: "89.990000", platformRoas: "3.829362" },
    ]);
    // Per campaign, with names from the synced campaigns; PMax had no spend left in the range.
    const campaigns = await source.getCampaignSpend(storeId, { start: "2026-10-15", end: "2026-10-19" });
    expect(campaigns).toEqual([
      expect.objectContaining({ platform: "google_ads", campaignId: "11", campaignName: "Brand", source: "api", attributable: true, spend: "23.500000", platformValue: "89.990000", otherTimezone: false }),
    ]);
  });

  it("records sync failures on the account and job; an invalid key marks the connection for re-authorisation", async () => {
    const { deps, scope, state, storeId } = await setup();
    const r = await connectGoogleAdsServiceAccount(deps, scope, { keyJson: KEY, loginCustomerId: MANAGER });
    const au = r.accounts.find((a) => a.customerId === AU)!;
    await mapAdAccount(db, scope, au.id, { storeId, syncEnabled: true });
    state.failWith = {
      status: 403,
      body: { error: { code: 403, status: "PERMISSION_DENIED", message: "x", details: [{ "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure", errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }, message: "The Google Cloud project is not approved for production access." }] }] } },
    };
    await expect(new AdsSyncService(deps).syncAccount(au.id)).rejects.toMatchObject({ kind: "not_approved" });
    expect((await db.select().from(schema.adAccount).where(eq(schema.adAccount.id, au.id)))[0]!.lastError).toMatch(/not approved/);
    expect((await db.select().from(schema.syncJob))[0]).toMatchObject({ status: "failed" });
    state.failWith = { status: 401, body: { error: { code: 401, status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." } } };
    await expect(new AdsSyncService(deps).syncAccount(au.id)).rejects.toMatchObject({ kind: "auth" });
    expect((await db.select().from(schema.adConnection))[0]).toMatchObject({ status: "needs_reauth" });
  });
});

describe("manual ad spend", () => {
  it("spreads amounts exactly", () => {
    expect(spreadAmount("100", 3)).toEqual(["33.333333", "33.333333", "33.333334"]);
    expect(sum(spreadAmount("1000.01", 31).map((x) => dec(x))).toFixed(6)).toBe("1000.010000");
  });

  it("records entries, guards against double counting, lets API data win, and is tenant-scoped", async () => {
    const { scope, storeId } = await seed("Owner");
    const range = { start: "2026-10-01", end: "2026-10-31" };
    expect(await saveManualSpend(db, scope, storeId, { platform: "meta", from: "2026-10-01", to: "2026-10-10", amount: "100", currency: "aud" })).toEqual({ days: 10 });
    await saveManualSpend(db, scope, storeId, { platform: "meta", from: "2026-10-05", amount: "4", currency: "AUD", note: "corrected" }); // replaces that day
    await saveManualSpend(db, scope, storeId, { platform: "google_ads", from: "2026-10-03", amount: "7", currency: "AUD" });
    const source = new DbReportingDataSource(db, scope.organizationId);
    expect(sum((await source.getDailyComponents(storeId, range)).map((d) => dec(d.adSpend))).toFixed(2)).toBe("101.00"); // 90 + 4 + 7

    // Google API data for 3 Oct arrives later: it replaces the manual figure for that day; new manual entries are refused.
    const [api] = await db.insert(schema.adAccount).values({ organizationId: scope.organizationId, platform: "google_ads", externalId: "4445556666", name: "API", currency: "AUD", timezone: "Australia/Sydney", storeId, syncEnabled: true }).returning();
    await db.insert(schema.adSpendDaily).values({ adAccountId: api!.id, level: "campaign", entityExternalId: "11", date: "2026-10-03", source: "api", spend: "9.50" });
    expect(sum((await source.getDailyComponents(storeId, range)).map((d) => dec(d.adSpend))).toFixed(2)).toBe("103.50"); // 94 + 9.50
    await expect(saveManualSpend(db, scope, storeId, { platform: "google_ads", from: "2026-10-01", to: "2026-10-05", amount: "50", currency: "AUD" })).rejects.toBeInstanceOf(CostInputError);
    await saveManualSpend(db, scope, storeId, { platform: "google_ads", from: "2026-10-03", amount: "1.25", currency: "AUD", adjustment: true });
    expect(sum((await source.getDailyComponents(storeId, range)).map((d) => dec(d.adSpend))).toFixed(2)).toBe("104.75");

    const entries = await listManualSpend(db, scope, storeId);
    expect(entries).toHaveLength(12);
    expect(entries.find((e) => e.date === "2026-10-05" && e.platform === "meta")).toMatchObject({ spend: "4.000000", note: "corrected" });
    expect(await deleteManualSpend(db, scope, storeId, [entries[0]!.id])).toBe(1);

    const other = await seed("Other");
    await expect(saveManualSpend(db, other.scope, storeId, { platform: "meta", from: "2026-10-01", amount: "1", currency: "AUD" })).rejects.toThrow();
    await expect(deleteManualSpend(db, other.scope, other.storeId, [entries[1]!.id])).rejects.toThrow();
    await expect(saveManualSpend(db, { ...scope, role: "viewer" }, storeId, { platform: "meta", from: "2026-10-01", amount: "1", currency: "AUD" })).rejects.toThrow(/permission/);
    await expect(saveManualSpend(db, scope, storeId, { platform: "meta", from: "2026-10-05", to: "2026-10-01", amount: "1", currency: "AUD" })).rejects.toThrow();
  });

  it("flags ad accounts in another time zone", async () => {
    const { scope, storeId } = await seed("Owner");
    const [us] = await db.insert(schema.adAccount).values({ organizationId: scope.organizationId, platform: "google_ads", externalId: "7778889999", name: "US", currency: "AUD", timezone: "America/New_York", storeId }).returning();
    await db.insert(schema.adSpendDaily).values({ adAccountId: us!.id, level: "campaign", entityExternalId: "1", date: "2026-10-03", source: "api", spend: "5" });
    const channels = await new DbReportingDataSource(db, scope.organizationId).getAdSpendByChannel(storeId, { start: "2026-10-01", end: "2026-10-31" });
    expect(channels[0]).toMatchObject({ channel: "google_ads", timezoneApproximation: true });
  });
});
