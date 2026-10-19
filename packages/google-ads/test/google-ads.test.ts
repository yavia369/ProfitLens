import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  campaignDailyQuery,
  errorFromBody,
  GoogleAdsClient,
  GoogleAdsError,
  mapCampaignDaily,
  mapCustomerClient,
  microsToAmount,
  normalizeCustomerId,
  parseServiceAccountKey,
  serviceAccountAssertion,
  serviceAccountTokens,
  TokenProvider,
  type FetchLike,
} from "../src";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const keyJson = JSON.stringify({ type: "service_account", project_id: "profitlens", client_email: "reader@profitlens.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" }, null, 2);

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    if (r.status === 0) throw new Error("ECONNRESET");
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, calls };
}

const failure = (status: string, httpCode: number, errorCode: Record<string, string>, message: string) => ({
  error: { code: httpCode, message: "Request had errors", status, details: [{ "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure", errors: [{ errorCode, message }], requestId: "req-1" }] },
});

describe("service account auth", () => {
  it("accepts the key as JSON (any whitespace) or base64, and rejects other credentials", () => {
    expect(parseServiceAccountKey(keyJson)).toMatchObject({ clientEmail: "reader@profitlens.iam.gserviceaccount.com", projectId: "profitlens" });
    expect(parseServiceAccountKey(Buffer.from(keyJson).toString("base64")).clientEmail).toBe("reader@profitlens.iam.gserviceaccount.com");
    expect(() => parseServiceAccountKey('{"type":"authorized_user","client_id":"x"}')).toThrow(/not a service account key/);
    expect(() => parseServiceAccountKey("not json")).toThrow(GoogleAdsError);
  });

  it("signs an RS256 JWT bearer assertion for the adwords scope, valid one hour", () => {
    const key = parseServiceAccountKey(keyJson);
    const jwt = serviceAccountAssertion(key, 1_800_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({
      iss: "reader@profitlens.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/adwords",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
  });

  it("exchanges the assertion for an access token, caches it, and renews before expiry", async () => {
    let now = 1_800_000_000_000;
    const { f, calls } = fakeFetch([
      { status: 200, body: { access_token: "ya29.one", expires_in: 3600 } },
      { status: 200, body: { access_token: "ya29.two", expires_in: 3600 } },
    ]);
    const tokens = serviceAccountTokens(parseServiceAccountKey(keyJson), f, () => now);
    expect(await tokens.get()).toBe("ya29.one");
    expect(await tokens.get()).toBe("ya29.one");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    now += 56 * 60_000; // within 5 minutes of expiry → renewed
    expect(await tokens.get()).toBe("ya29.two");
    expect(calls).toHaveLength(2);
  });

  it("reports a rejected key as an auth error", async () => {
    const { f } = fakeFetch([{ status: 400, body: { error: "invalid_grant", error_description: "Invalid JWT Signature." } }]);
    await expect(serviceAccountTokens(parseServiceAccountKey(keyJson), f).get()).rejects.toMatchObject({ kind: "auth", message: "Google sign-in failed: Invalid JWT Signature." });
  });

  it("token provider shares one in-flight request", async () => {
    let n = 0;
    const p = new TokenProvider(async () => ({ token: `t${++n}`, expiresAt: Date.now() + 3_600_000 }));
    expect(await Promise.all([p.get(), p.get(), p.get()])).toEqual(["t1", "t1", "t1"]);
  });
});

describe("REST client", () => {
  const client = (f: FetchLike) => new GoogleAdsClient({ getAccessToken: async () => "tok", fetch: f, sleep: async () => {}, random: () => 0.5 });

  it("lists accessible customers and streams GAQL with the manager login header", async () => {
    const { f, calls } = fakeFetch([
      { status: 200, body: { resourceNames: ["customers/1234567890", "customers/9876543210"] } },
      { status: 200, body: [{ results: [{ a: 1 }, { a: 2 }], fieldMask: "a" }, { results: [{ a: 3 }] }] },
    ]);
    const c = client(f);
    expect(await c.listAccessibleCustomers()).toEqual(["1234567890", "9876543210"]);
    expect(await c.searchStream("123-456-7890", "SELECT a FROM b", "111-222-3333")).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(calls[1]!.url).toBe("https://googleads.googleapis.com/v26/customers/1234567890/googleAds:searchStream");
    expect(calls[1]!.init.headers).toMatchObject({ Authorization: "Bearer tok", "login-customer-id": "1112223333", "Content-Type": "application/json" });
    expect(calls[0]!.init.headers["login-customer-id"]).toBeUndefined();
    expect(JSON.parse(calls[1]!.init.body!)).toEqual({ query: "SELECT a FROM b" });
  });

  it("retries quota, server and network errors, then succeeds", async () => {
    const { f, calls } = fakeFetch([
      { status: 429, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Too many requests" } } },
      { status: 0, body: null },
      { status: 503, body: { error: { code: 503, status: "UNAVAILABLE" } } },
      { status: 200, body: [] },
    ]);
    expect(await client(f).searchStream("1234567890", "SELECT x FROM y")).toEqual([]);
    expect(calls).toHaveLength(4);
  });

  it("does not retry permission errors and keeps Google's specific code", async () => {
    const { f, calls } = fakeFetch([{ status: 403, body: failure("PERMISSION_DENIED", 403, { authorizationError: "USER_PERMISSION_DENIED" }, "User doesn't have permission to access customer.") }]);
    await expect(client(f).searchStream("1234567890", "SELECT x FROM y")).rejects.toMatchObject({ kind: "permission", code: "USER_PERMISSION_DENIED", requestId: "req-1" });
    expect(calls).toHaveLength(1);
  });

  it("surfaces an unapproved Cloud project and mid-stream errors", async () => {
    expect(errorFromBody(403, failure("PERMISSION_DENIED", 403, { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }, "Project not approved"))).toMatchObject({ kind: "not_approved" });
    const { f } = fakeFetch([{ status: 200, body: [{ results: [{ a: 1 }] }, failure("INVALID_ARGUMENT", 400, { queryError: "BAD_FIELD_NAME" }, "Unrecognized field")] }]);
    await expect(client(f).searchStream("1234567890", "SELECT x FROM y")).rejects.toMatchObject({ kind: "invalid", code: "BAD_FIELD_NAME" });
  });
});

describe("queries and mappers", () => {
  it("validates customer IDs and date ranges", () => {
    expect(normalizeCustomerId(" 123-456-7890 ")).toBe("1234567890");
    expect(() => normalizeCustomerId("12345")).toThrow(GoogleAdsError);
    expect(campaignDailyQuery("2026-10-01", "2026-10-03")).toContain("segments.date BETWEEN '2026-10-01' AND '2026-10-03'");
    expect(() => campaignDailyQuery("2026-10-03", "2026-10-01")).toThrow(GoogleAdsError);
    expect(() => campaignDailyQuery("2026-10-01' OR '1'='1", "2026-10-03")).toThrow(GoogleAdsError);
  });

  it("converts cost micros exactly (no floating point)", () => {
    expect(microsToAmount("12345678")).toBe("12.345678");
    expect(microsToAmount("1")).toBe("0.000001");
    expect(microsToAmount("90071992547409930000")).toBe("90071992547409.930000"); // beyond 2^53
    expect(microsToAmount(undefined)).toBe("0.000000");
    expect(() => microsToAmount("1.5")).toThrow(GoogleAdsError);
  });

  it("maps campaign rows with omitted zero metrics and manager children", () => {
    expect(mapCampaignDaily({ campaign: { id: "42", name: "Brand", status: "ENABLED", advertisingChannelType: "SEARCH" }, segments: { date: "2026-10-03" }, metrics: { costMicros: "18450000", clicks: "12", conversions: 1.5, conversionsValue: 89.99 } })).toEqual({
      campaignId: "42",
      campaignName: "Brand",
      campaignStatus: "ENABLED",
      channelType: "SEARCH",
      date: "2026-10-03",
      spend: "18.450000",
      impressions: 0n,
      clicks: 12n,
      conversions: "1.500000",
      conversionValue: "89.990000",
    });
    expect(mapCampaignDaily({ campaign: { id: "7" }, segments: { date: "2026-10-03" } })).toMatchObject({ spend: "0.000000", campaignName: "Campaign 7" });
    expect(mapCustomerClient({ customerClient: { id: "1234567890", currencyCode: "AUD", timeZone: "Australia/Sydney", level: "1", status: "CANCELED" } })).toMatchObject({
      name: "Google Ads 1234567890",
      isManager: false,
      status: "CANCELED",
    });
  });
});
