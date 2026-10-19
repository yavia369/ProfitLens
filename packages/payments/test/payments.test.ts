import { describe, expect, it } from "vitest";
import { mapPayPalPayment, mapStripePayment, PayPalClient, StripeClient, stripeMinorToAmount, STRIPE_API_VERSION, type FetchLike } from "../src/index";

type Reply = { status: number; body: unknown };
function fake(replies: Reply[]) {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { status: 500, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return { f, calls };
}

describe("Stripe", () => {
  it("converts minor units by Stripe's rules and refuses unverified three-decimal currencies", () => {
    expect(stripeMinorToAmount(8995, "aud")).toBe("89.950000");
    expect(stripeMinorToAmount(500, "jpy")).toBe("500.000000");
    expect(stripeMinorToAmount(500, "isk")).toBe("5.000000"); // two-decimal representation (VERIFIED special case)
    expect(stripeMinorToAmount(5000, "kwd")).toBeNull();
  });

  it("maps charges with the customer's amount and the fee in the balance currency; ignores non-payments", () => {
    const base = { id: "txn_1", amount: 8995, currency: "aud", fee: 291, created: 1792404000, status: "available", exchange_rate: null };
    expect(mapStripePayment({ ...base, type: "charge", source: { id: "ch_1", object: "charge", amount: 8995, currency: "aud", created: 1792403990 } })).toEqual({
      id: "txn_1",
      occurredAt: new Date(1792403990 * 1000),
      amount: "89.950000",
      currency: "AUD",
      fee: "2.910000",
      feeCurrency: "AUD",
    });
    // Converted charge: gross stays in the customer's currency (from the expanded source).
    expect(mapStripePayment({ ...base, type: "charge", amount: 13500, exchange_rate: 1.5, source: { id: "ch_2", object: "charge", amount: 9000, currency: "usd", created: 1 } })).toMatchObject({ amount: "90.000000", currency: "USD", feeCurrency: "AUD" });
    expect(mapStripePayment({ ...base, type: "payout", source: null })).toBeNull();
    expect(mapStripePayment({ ...base, type: "charge", exchange_rate: 1.5, source: "ch_3" })).toBeNull(); // converted, source not expanded: unknown
  });

  it("pins the API version, pages with starting_after, and classifies errors", async () => {
    const { f, calls } = fake([
      { status: 200, body: { data: [{ id: "txn_a" }, { id: "txn_b" }], has_more: true } },
      { status: 200, body: { data: [{ id: "txn_c" }], has_more: false } },
    ]);
    const c = new StripeClient({ secretKey: "rk_live_abcdefghijklmnop", fetch: f, sleep: async () => {} });
    expect((await c.balanceTransactions(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-02T00:00:00Z"))).map((t) => t.id)).toEqual(["txn_a", "txn_b", "txn_c"]);
    expect(calls[0]!.init.headers["Stripe-Version"]).toBe(STRIPE_API_VERSION);
    expect(new URL(calls[1]!.url).searchParams.get("starting_after")).toBe("txn_b");
    expect(new URL(calls[0]!.url).searchParams.get("expand[]")).toBe("data.source");
    const bad = fake([{ status: 401, body: { error: { message: "Invalid API Key provided: rk_live_***mnop", type: "invalid_request_error" } } }]);
    await expect(new StripeClient({ secretKey: "rk_live_abcdefghijklmnop", fetch: bad.f }).balanceTransactions(new Date(0), new Date(1000))).rejects.toMatchObject({ kind: "auth", gateway: "stripe" });
    expect(() => new StripeClient({ secretKey: "pk_live_abc" })).toThrow(/secret or restricted key/);
  });
});

describe("PayPal", () => {
  it("maps successful T00xx payments (fee absent = none applied), ignores refunds and pending", () => {
    const t = (code: string, value: string, status = "S", fee?: string) => ({
      transaction_info: {
        transaction_id: "9AB12345CD6789012",
        transaction_event_code: code,
        transaction_initiation_date: "2026-10-14T10:00:00+0000",
        transaction_amount: { currency_code: "AUD", value },
        ...(fee ? { fee_amount: { currency_code: "AUD", value: fee } } : {}),
        transaction_status: status,
      },
    });
    expect(mapPayPalPayment(t("T0006", "89.95", "S", "-3.79"))).toEqual({ id: "9AB12345CD6789012", occurredAt: new Date("2026-10-14T10:00:00Z"), amount: "89.950000", currency: "AUD", fee: "3.790000", feeCurrency: "AUD" });
    expect(mapPayPalPayment(t("T0006", "10.00"))!.fee).toBe("0.000000");
    expect(mapPayPalPayment(t("T1107", "-89.95"))).toBeNull();
    expect(mapPayPalPayment(t("T0006", "89.95", "P"))).toBeNull();
  });

  it("gets a client-credentials token once, searches pages, and refuses ranges over 31 days", async () => {
    const { f, calls } = fake([
      { status: 200, body: { access_token: "A21AA-token", expires_in: 32400 } },
      { status: 200, body: { transaction_details: [{ transaction_info: { transaction_id: "1" } }], total_pages: 2 } },
      { status: 200, body: { transaction_details: [{ transaction_info: { transaction_id: "2" } }], total_pages: 2 } },
    ]);
    const c = new PayPalClient({ clientId: "client-id-1234", clientSecret: "client-secret-1234", fetch: f, sleep: async () => {}, now: () => 0 });
    const rows = await c.transactions(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T00:00:00Z"));
    expect(rows.map((r) => r.transaction_info.transaction_id)).toEqual(["1", "2"]);
    expect(calls[0]!.url).toBe("https://api-m.paypal.com/v1/oauth2/token");
    expect(calls[0]!.init.body).toBe("grant_type=client_credentials");
    expect(calls[1]!.init.headers.Authorization).toBe("Bearer A21AA-token");
    expect(Object.fromEntries(new URL(calls[1]!.url).searchParams)).toMatchObject({ start_date: "2026-10-01T00:00:00Z", end_date: "2026-10-31T00:00:00Z", fields: "transaction_info", page_size: "500", page: "1" });
    await expect(c.transactions(new Date("2026-09-01T00:00:00Z"), new Date("2026-10-15T00:00:00Z"))).rejects.toThrow(/31 days/);
    const bad = fake([{ status: 401, body: { error: "invalid_client", error_description: "Client Authentication failed" } }]);
    await expect(new PayPalClient({ clientId: "client-id-1234", clientSecret: "client-secret-1234", fetch: bad.f }).accessToken()).rejects.toMatchObject({ kind: "auth", message: "Client Authentication failed" });
  });
});
