import { randomBytes } from "node:crypto";
import { createDb, createPool, schema, type Database, type OrgScope } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { dec, sum } from "@profitlens/finance";
import { and, eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdsSyncService, connectMetaSystemUser, mapAdAccount, MetaAdsError, saveManualSpend } from "../src/ads";
import { DbReportingDataSource } from "../src/profit";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
const keyring = { keys: { k1: randomBytes(32).toString("base64") }, activeKid: "k1" };
const NOW = new Date("2026-10-19T03:00:00Z"); // 19 Oct in Sydney
const TOKEN = "EAAB-system-user-token-0123456789";
let pool: pg.Pool;
let db: Database;

interface MetaState {
  accounts: { id: string; account_id: string; name: string; currency: string; timezone_name: string; account_status: number }[];
  /** account → date → campaign rows */
  spend: Record<string, Record<string, { id: string; name: string; spend: string; value?: string }[]>>;
  failWith?: { status: number; body: unknown };
  calls: string[];
  refreshes?: number;
}

/** Fake Graph API (shapes as documented for v26 and observed live for errors). */
function fakeMeta(state: MetaState) {
  return async (url: string, init: { headers: Record<string, string> }) => {
    state.calls.push(url);
    const respond = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (!new URL(url).pathname.endsWith("/oauth/access_token") && init.headers.Authorization !== `Bearer ${TOKEN}`) return respond(400, { error: { code: 190, message: "Invalid OAuth access token - Cannot parse access token", type: "OAuthException" } });
    if (state.failWith) return respond(state.failWith.status, state.failWith.body);
    const u = new URL(url);
    if (u.pathname === "/v26.0/oauth/access_token") {
      state.refreshes = (state.refreshes ?? 0) + 1;
      return u.searchParams.get("client_secret") === "app-secret"
        ? respond(200, { access_token: TOKEN, token_type: "bearer", expires_in: 60 * 86400 })
        : respond(400, { error: { code: 1, message: "Error validating client secret." } });
    }
    if (u.pathname === "/v26.0/me") return respond(200, { id: "61550000000001", name: "ProfitLens reader" });
    if (u.pathname === "/v26.0/me/adaccounts") return respond(200, { data: state.accounts });
    const m = /^\/v26\.0\/act_(\d+)\/insights$/.exec(u.pathname);
    if (m) {
      const { since, until } = JSON.parse(u.searchParams.get("time_range")!) as { since: string; until: string };
      const data = Object.entries(state.spend[m[1]!] ?? {})
        .filter(([d]) => d >= since && d <= until)
        .flatMap(([date, rows]) =>
          rows.map((r) => ({ campaign_id: r.id, campaign_name: r.name, spend: r.spend, impressions: "1000", clicks: "20", date_start: date, date_stop: date, ...(r.value ? { action_values: [{ action_type: "omni_purchase", value: r.value }] } : {}) })),
        );
      return respond(200, { data, paging: {} });
    }
    return respond(400, { error: { code: 100, message: `Unknown path ${u.pathname}` } });
  };
}

async function seed(): Promise<{ scope: OrgScope; storeId: string }> {
  const userId = `user-${Date.now()}-${Math.random()}`;
  await db.insert(schema.user).values({ id: userId, name: "Owner", email: `${userId}@example.com` });
  const [org] = await db.insert(schema.organization).values({ name: "Owner" }).returning();
  await db.insert(schema.membership).values({ organizationId: org!.id, userId, role: "owner" });
  const [st] = await db.insert(schema.store).values({ organizationId: org!.id, shopDomain: `m-${Math.floor(Math.random() * 1e9)}.myshopify.com`, name: "Store", currency: "AUD", ianaTimezone: "Australia/Sydney", status: "active" }).returning();
  return { scope: { userId, organizationId: org!.id, role: "owner" }, storeId: st!.id };
}

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "meta"), 4);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE "organization", "user" RESTART IDENTITY CASCADE`);
});

describe("Meta Ads (fake Graph API, real Postgres)", () => {
  const setup = async () => {
    const { scope, storeId } = await seed();
    const state: MetaState = {
      accounts: [
        { id: "act_111", account_id: "111", name: "Luraflo Meta", currency: "AUD", timezone_name: "Australia/Sydney", account_status: 1 },
        { id: "act_222", account_id: "222", name: "Old account", currency: "AUD", timezone_name: "Australia/Sydney", account_status: 101 },
      ],
      spend: {
        "111": {
          "2026-10-17": [{ id: "120001", name: "Prospecting", spend: "40.50", value: "210.00" }, { id: "120002", name: "Retargeting", spend: "9.50" }],
          "2026-10-18": [{ id: "120001", name: "Prospecting", spend: "38.00" }],
          "2024-01-05": [{ id: "120001", name: "Prospecting", spend: "5.00" }],
        },
      },
      calls: [],
    };
    const deps = { db, keyring, fetch: fakeMeta(state) as never, sleep: async () => {}, now: () => NOW };
    return { scope, storeId, state, deps };
  };

  it("connects with a system-user token (stored encrypted) and discovers ad accounts", async () => {
    const { scope, deps, state } = await setup();
    await expect(connectMetaSystemUser(deps, scope, { accessToken: "EAAB-wrong-token-0000000000" })).rejects.toMatchObject({ kind: "auth", code: 190 });
    const r = await connectMetaSystemUser(deps, scope, { accessToken: ` ${TOKEN} ` });
    expect(r.userName).toBe("ProfitLens reader");
    expect(r.accounts.map((a) => [a.accountId, a.status])).toEqual([["111", "ACTIVE"], ["222", "CLOSED"]]);
    const [conn] = await db.select().from(schema.adConnection);
    expect(conn).toMatchObject({ platform: "meta", authType: "system_user", externalUserId: "61550000000001", status: "active" });
    expect(conn!.credentialsEnc).not.toContain(TOKEN);
    expect(state.calls.every((c) => !c.includes(TOKEN))).toBe(true);
    // A token that sees no ad account is refused with the fix spelled out.
    state.accounts = [];
    await expect(connectMetaSystemUser(deps, scope, { accessToken: TOKEN })).rejects.toThrow(/assign the ad account to this system user/);
  });

  it("maps, backfills 3 years in 31-day windows, re-reads 3 days, and lets API data replace manual entries", async () => {
    const { scope, storeId, deps, state } = await setup();
    const { accounts } = await connectMetaSystemUser(deps, scope, { accessToken: TOKEN });
    const live = accounts.find((a) => a.accountId === "111")!;
    const closed = accounts.find((a) => a.accountId === "222")!;
    await expect(mapAdAccount(db, scope, closed.id, { storeId, syncEnabled: true })).rejects.toThrow(MetaAdsError);
    // A manual Meta entry made before the connection, for a day the API will cover.
    expect(await saveManualSpend(db, scope, storeId, { platform: "meta", from: "2026-10-17", amount: "99", currency: "AUD", note: "invoice" })).toEqual({ days: 1 });
    await mapAdAccount(db, scope, live.id, { storeId, syncEnabled: true });
    const ads = new AdsSyncService(deps);
    expect(await ads.syncableAccounts()).toEqual([live.id]);
    state.calls = [];
    const first = await ads.syncAccount(live.id);
    expect(first).toMatchObject({ from: "2023-10-20", to: "2026-10-19", stats: { rows: 4, campaigns: 2, restatedDays: 0 } });
    expect(state.calls).toHaveLength(Math.ceil(1096 / 31));
    const [job] = await db.select().from(schema.syncJob);
    expect(job).toMatchObject({ kind: "ads.meta.sync", status: "succeeded" });

    // Meta restates 17 Oct: Retargeting disappears, Prospecting rises.
    state.spend["111"]!["2026-10-17"] = [{ id: "120001", name: "Prospecting", spend: "42.00", value: "210.00" }];
    const second = await ads.syncAccount(live.id);
    expect(second).toMatchObject({ from: "2026-10-16", stats: { restatedDays: 1 } });
    const rows = await db.select().from(schema.adSpendDaily).where(and(eq(schema.adSpendDaily.date, "2026-10-17"), eq(schema.adSpendDaily.source, "api")));
    expect(rows.map((r) => r.spend)).toEqual(["42.000000"]);

    const source = new DbReportingDataSource(db, scope.organizationId);
    const range = { start: "2026-10-15", end: "2026-10-19" };
    const days = await source.getDailyComponents(storeId, range);
    expect(sum(days.map((d) => dec(d.adSpend))).toFixed(2)).toBe("80.00"); // 42 + 38; any manual Meta entry that day is replaced
    expect(await source.getAdSpendByChannel(storeId, range)).toEqual([
      { channel: "meta", label: "Meta", source: "api", spend: "80.000000", platformConversionValue: "210.000000", platformRoas: "2.625000" },
    ]);
    const campaigns = await source.getCampaignSpend(storeId, range);
    expect(campaigns).toEqual([expect.objectContaining({ platform: "meta", campaignId: "120001", campaignName: "Prospecting", attributable: true, spend: "80.000000" })]);
  });

  it("refreshes an expiring token with the app credentials at connect and when expiry is near", async () => {
    const { scope, storeId, deps, state } = await setup();
    await expect(connectMetaSystemUser(deps, scope, { accessToken: TOKEN, appId: "1234567", appSecret: "" })).rejects.toThrow(/both the app ID and the app secret/);
    await expect(connectMetaSystemUser(deps, scope, { accessToken: TOKEN, appId: "1234567", appSecret: "wrong" })).rejects.toThrow(MetaAdsError);
    const { accounts } = await connectMetaSystemUser(deps, scope, { accessToken: TOKEN, appId: "1234567", appSecret: "app-secret" });
    expect(state.refreshes).toBe(2);
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "ads.connect"));
    expect(audit[0]!.after).toMatchObject({ expiringToken: true, expiresAt: "2026-12-18T03:00:00.000Z" });
    expect(state.calls.filter((c) => c.includes("appsecret_proof")).length).toBeGreaterThan(0);
    await mapAdAccount(db, scope, accounts[0]!.id, { storeId, syncEnabled: true });
    // 50 days later fewer than 15 days remain: the next sync refreshes first.
    const later = { ...deps, now: () => new Date(NOW.getTime() + 50 * 86_400_000) };
    await new AdsSyncService(later).syncAccount(accounts[0]!.id);
    expect(state.refreshes).toBe(3);
  });

  it("marks the connection for re-authorisation when the token stops working", async () => {
    const { scope, storeId, deps, state } = await setup();
    const { accounts } = await connectMetaSystemUser(deps, scope, { accessToken: TOKEN });
    await mapAdAccount(db, scope, accounts[0]!.id, { storeId, syncEnabled: true });
    state.failWith = { status: 400, body: { error: { code: 190, error_subcode: 460, message: "Error validating access token: The session has been invalidated" } } };
    await expect(new AdsSyncService(deps).syncAccount(accounts[0]!.id)).rejects.toMatchObject({ kind: "auth" });
    expect((await db.select().from(schema.adConnection))[0]).toMatchObject({ status: "needs_reauth" });
    expect((await db.select().from(schema.adAccount).where(eq(schema.adAccount.id, accounts[0]!.id)))[0]!.lastError).toMatch(/session has been invalidated/);
  });
});
