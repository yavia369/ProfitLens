import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_INSIGHT_FIELDS,
  errorFromBody,
  mapAdAccount,
  mapCampaignInsight,
  MetaAdsClient,
  MetaAdsError,
  normalizeAdAccountId,
  type FetchLike,
} from "../src/index";

const TOKEN = "EAAB-system-user-token-0123456789";
type Reply = { status: number; body: unknown };
function fake(replies: Reply[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const r = replies.shift() ?? { status: 500, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { f, calls };
}
const client = (f: FetchLike) => new MetaAdsClient({ accessToken: TOKEN, fetch: f, sleep: async () => {}, random: () => 0.5 });

describe("Meta errors (v26 error reference)", () => {
  it("classifies auth, permission, quota, transient and invalid errors", () => {
    expect(errorFromBody(400, { error: { code: 190, message: "Invalid OAuth access token" } }).kind).toBe("auth");
    expect(errorFromBody(400, { error: { code: 2500 } }).kind).toBe("auth");
    expect(errorFromBody(400, { error: { code: 200 } }).kind).toBe("permission");
    expect(errorFromBody(400, { error: { code: 10 } }).kind).toBe("permission");
    for (const code of [4, 17, 613, 80000, 80004]) expect(errorFromBody(400, { error: { code } }).kind).toBe("quota");
    expect(errorFromBody(500, { error: { code: 1, is_transient: true } }).kind).toBe("server");
    expect(errorFromBody(400, { error: { code: 100, error_subcode: 33, error_user_msg: "Bad field" } })).toMatchObject({ kind: "invalid", subcode: 33, message: "Bad field" });
  });
});

describe("Meta client", () => {
  it("sends the token only in the Authorization header and retries rate limits", async () => {
    const { f, calls } = fake([
      { status: 400, body: { error: { code: 17, message: "User request limit reached" } } },
      { status: 200, body: { id: "1001", name: "ProfitLens reader" } },
    ]);
    expect(await client(f).me()).toEqual({ id: "1001", name: "ProfitLens reader" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls.every((c) => !c.url.includes(TOKEN))).toBe(true);
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v26.0/me?fields=id%2Cname");
  });

  it("does not retry an invalid token", async () => {
    const { f, calls } = fake([{ status: 400, body: { error: { code: 190, message: "Error validating access token" } } }]);
    await expect(client(f).me()).rejects.toMatchObject({ kind: "auth", code: 190 });
    expect(calls).toHaveLength(1);
  });

  it("follows pagination on the Graph host only, without tokens in URLs", async () => {
    const { f, calls } = fake([
      { status: 200, body: { data: [{ campaign_id: "1" }], paging: { next: `https://graph.facebook.com/v26.0/act_123/insights?after=abc&access_token=${TOKEN}` } } },
      { status: 200, body: { data: [{ campaign_id: "2" }] } },
    ]);
    const rows = await client(f).campaignInsightsDaily<{ campaign_id: string }>("act_123", "2026-10-01", "2026-10-15", CAMPAIGN_INSIGHT_FIELDS);
    expect(rows.map((r) => r.campaign_id)).toEqual(["1", "2"]);
    const first = new URL(calls[0]!.url);
    expect(first.pathname).toBe("/v26.0/act_123/insights");
    expect(Object.fromEntries(first.searchParams)).toMatchObject({ level: "campaign", time_increment: "1", time_range: '{"since":"2026-10-01","until":"2026-10-15"}', use_account_attribution_setting: "true" });
    expect(calls[1]!.url).not.toContain("access_token");

    const evil = fake([{ status: 200, body: { data: [], paging: { next: "https://evil.example.com/steal" } } }]);
    await expect(client(evil.f).campaignInsightsDaily("123", "2026-10-01", "2026-10-02", "spend")).rejects.toThrow(/pagination host/);
  });

  it("signs calls with appsecret_proof when an app secret is configured", async () => {
    const { f, calls } = fake([{ status: 200, body: { id: "1", name: "x" } }]);
    await new MetaAdsClient({ accessToken: TOKEN, appSecret: "app-secret", fetch: f }).me();
    const proof = new URL(calls[0]!.url).searchParams.get("appsecret_proof");
    expect(proof).toBe(createHmac("sha256", "app-secret").update(TOKEN).digest("hex"));
    expect(calls[0]!.url).not.toContain("app-secret");
  });

  it("refreshes an expiring system-user token", async () => {
    const { f, calls } = fake([{ status: 200, body: { access_token: "EAAB-refreshed-token-0000000000", token_type: "bearer", expires_in: 5183944 } }]);
    const r = await MetaAdsClient.refreshSystemUserToken({ accessToken: TOKEN, appId: "123", appSecret: "s3cret" }, { fetch: f });
    expect(r).toEqual({ accessToken: "EAAB-refreshed-token-0000000000", expiresInSeconds: 5183944 });
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toMatchObject({ grant_type: "fb_exchange_token", client_id: "123", set_token_expires_in_60_days: "true" });
    const bad = fake([{ status: 400, body: { error: { code: 190, message: "expired" } } }]);
    await expect(MetaAdsClient.refreshSystemUserToken({ accessToken: TOKEN, appId: "123", appSecret: "s" }, { fetch: bad.f })).rejects.toMatchObject({ kind: "auth" });
  });

  it("validates tokens and ad account ids", () => {
    expect(() => new MetaAdsClient({ accessToken: "short" })).toThrow(MetaAdsError);
    expect(normalizeAdAccountId("act_1234567")).toBe("1234567");
    expect(() => normalizeAdAccountId("act_12a")).toThrow(/not a Meta ad account/);
  });
});

describe("Meta mappers", () => {
  it("maps ad accounts with their status", () => {
    expect(mapAdAccount({ id: "act_987654", account_id: "987654", name: "Luraflo", currency: "AUD", timezone_name: "Australia/Sydney", account_status: 1 })).toEqual({
      accountId: "987654",
      name: "Luraflo",
      currency: "AUD",
      timezone: "Australia/Sydney",
      status: "ACTIVE",
    });
    expect(mapAdAccount({ id: "act_1", account_id: "1", currency: "USD", timezone_name: "America/New_York", account_status: 101 }).status).toBe("CLOSED");
  });

  it("maps daily campaign rows exactly; purchases use omni_purchase, never added to the pixel count", () => {
    const row = mapCampaignInsight({
      campaign_id: "120210001",
      campaign_name: "Prospecting",
      date_start: "2026-10-14",
      date_stop: "2026-10-14",
      spend: "123.45",
      impressions: "10500",
      clicks: "321",
      actions: [
        { action_type: "link_click", value: "321" },
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" },
        { action_type: "omni_purchase", value: "5" },
      ],
      action_values: [
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "380.10" },
        { action_type: "omni_purchase", value: "455.99" },
      ],
    });
    expect(row).toEqual({ campaignId: "120210001", campaignName: "Prospecting", date: "2026-10-14", spend: "123.450000", impressions: 10500n, clicks: 321n, conversions: "5.000000", conversionValue: "455.990000" });
    expect(mapCampaignInsight({ campaign_id: "1", date_start: "2026-10-14", date_stop: "2026-10-14", action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "10" }] }).conversionValue).toBe("10.000000");
    expect(() => mapCampaignInsight({ campaign_id: "1", date_start: "2026-10-01", date_stop: "2026-10-14" })).toThrow(/daily row/);
  });
});
