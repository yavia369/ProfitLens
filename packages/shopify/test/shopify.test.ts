import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AdminClient,
  assembleBulkJsonl,
  bulkOrdersQuery,
  mapOrder,
  mapProduct,
  mapShop,
  parseWebhookHeaders,
  requestClientCredentialsToken,
  ShopifyError,
  TokenProvider,
  verifyOAuthQueryHmac,
  verifyWebhookHmac,
  type FetchLike,
  type RawOrder,
} from "../src";
import { bulkOrderLines, pagedOrder } from "./fixtures/orders";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
function fakeFetch(replies: Reply[]): FetchLike & { calls: { url: string; body?: string }[] } {
  const calls: { url: string; body?: string }[] = [];
  const fn = (async (url: string, init: { body?: string }) => {
    calls.push({ url, ...(init.body ? { body: init.body } : {}) });
    const r = replies.shift();
    if (!r) throw new Error("no more fake replies");
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (n: string) => r.headers?.[n] ?? null },
      json: async () => r.body,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  }) as unknown as FetchLike & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

const throttle = (currentlyAvailable: number) => ({ cost: { requestedQueryCost: 10, actualQueryCost: 10, throttleStatus: { maximumAvailable: 2000, currentlyAvailable, restoreRate: 100 } } });

describe("order mapping", () => {
  const facts = mapOrder(pagedOrder(), "Australia/Sydney");

  it("dates events in the store timezone (23:30 AEST on 3 Oct, not UTC)", () => {
    expect(facts.order.processedLocalDate).toBe("2026-10-03");
    expect(facts.sales.find((s) => s.saleGid.endsWith("/6"))!.happenedLocalDate).toBe("2026-10-08");
    expect(facts.sales.find((s) => s.saleGid.endsWith("/5"))!.happenedLocalDate).toBe("2026-10-04");
  });

  it("keeps money as exact decimal strings in shop currency", () => {
    expect(facts.order.totalPrice).toBe("248.940000");
    expect(facts.lineItems[0]!.originalUnitPrice).toBe("89.950000");
    const ret = facts.sales.find((s) => s.actionType === "RETURN")!;
    expect(ret.totalAmount).toBe("-89.060000");
    expect(ret.refundGid).toBe("gid://shopify/Refund/300");
  });

  it("captures the full agreement ledger (order, edit, return) with line links", () => {
    expect(facts.sales.map((s) => `${s.agreementType}:${s.actionType}:${s.lineType}`)).toEqual([
      "OrderAgreement:ORDER:PRODUCT",
      "OrderAgreement:ORDER:PRODUCT",
      "OrderAgreement:ORDER:SHIPPING",
      "OrderAgreement:ORDER:TIP",
      "OrderEditAgreement:UPDATE:PRODUCT",
      "RefundAgreement:RETURN:PRODUCT",
    ]);
    expect(facts.sales[0]!.lineItemGid).toBe("gid://shopify/LineItem/1");
  });

  it("maps refunds with restock type and transactions with actual fees (incl. tax on fee)", () => {
    expect(facts.refunds[0]!.lineItems[0]).toMatchObject({ restockType: "RETURN", quantity: 1, restocked: true });
    const sale = facts.transactions.find((t) => t.kind === "SALE")!;
    expect(sale).toMatchObject({ feeAmount: "4.660000", feeTaxAmount: "0.420000", feeRate: "0.017500", feeFlat: "0.300000" });
    expect(facts.transactions.find((t) => t.kind === "REFUND")!.feeAmount).toBeNull(); // no fee data ≠ zero fee
  });

  it("keeps attribution hints from the customer journey (last visit)", () => {
    expect(facts.order).toMatchObject({ utmSource: "google", utmMedium: "cpc", utmCampaign: "brand", shippingCountryCode: "AU", customerGid: "gid://shopify/Customer/77" });
  });
});

describe("bulk JSONL", () => {
  it("reassembles child lines into the same structure as the paged query", () => {
    const assembled = assembleBulkJsonl<RawOrder>(bulkOrderLines());
    expect(assembled).toHaveLength(1);
    expect(mapOrder(assembled[0]!, "Australia/Sydney")).toEqual(mapOrder(pagedOrder(), "Australia/Sydney"));
  });

  it("rejects orphan lines instead of silently dropping data", () => {
    expect(() => assembleBulkJsonl([JSON.stringify({ id: "gid://shopify/LineItem/9", __parentId: "gid://shopify/Order/404" })])).toThrow(ShopifyError);
  });

  it("builds a bulk query within the documented connection limits", () => {
    const q = bulkOrdersQuery("updated_at:>='2026-01-01T00:00:00Z'");
    expect((q.match(/\{ edges \{ node/g) ?? []).length).toBeLessThanOrEqual(5);
    expect(q).not.toMatch(/\b(orders|lineItems|agreements|sales|refundLineItems)\(first/); // bulk connections take no pagination args
    expect(q).toContain("transactions(first: 50)"); // lists still need an argument
  });
});

describe("GraphQL client", () => {
  const base = { shopDomain: "example.myshopify.com", apiVersion: "2026-10", getAccessToken: async () => "tok", random: () => 0.5 };

  it("retries THROTTLED responses with backoff, then succeeds", async () => {
    const f = fakeFetch([
      { status: 200, body: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }], extensions: throttle(0) } },
      { status: 200, body: { data: { shop: { id: "1" } }, extensions: throttle(1990) } },
    ]);
    const sleep = vi.fn(async () => {});
    const c = new AdminClient({ ...base, fetch: f, sleep });
    const r = await c.request<{ shop: { id: string } }>("{ shop { id } }");
    expect(r.data.shop.id).toBe("1");
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalled();
    expect(f.calls[0]!.url).toBe("https://example.myshopify.com/admin/api/2026-10/graphql.json");
  });

  it("retries 5xx and network errors up to the attempt limit", async () => {
    const f = fakeFetch([{ status: 502 }, { status: 503 }, { status: 500 }]);
    const c = new AdminClient({ ...base, fetch: f, sleep: async () => {}, maxAttempts: 3 });
    await expect(c.request("{ shop { id } }")).rejects.toMatchObject({ kind: "server", status: 500 });
    expect(f.calls).toHaveLength(3);
  });

  it("does not retry authentication failures or access-denied errors", async () => {
    const f = fakeFetch([{ status: 401, body: "Invalid API key or access token" }]);
    const c = new AdminClient({ ...base, fetch: f, sleep: async () => {} });
    await expect(c.request("{ shop { id } }")).rejects.toMatchObject({ kind: "auth" });
    expect(f.calls).toHaveLength(1);

    const g = fakeFetch([{ status: 200, body: { errors: [{ message: "Access denied for orders", extensions: { code: "ACCESS_DENIED" } }] } }]);
    await expect(new AdminClient({ ...base, fetch: g }).request("{ orders { id } }")).rejects.toMatchObject({ kind: "auth" });
  });

  it("waits proactively when the bucket is nearly empty", async () => {
    const f = fakeFetch([
      { status: 200, body: { data: { a: 1 }, extensions: throttle(5) } },
      { status: 200, body: { data: { a: 2 }, extensions: throttle(1000) } },
    ]);
    const sleep = vi.fn(async () => {});
    const c = new AdminClient({ ...base, fetch: f, sleep });
    await c.request("{ a }");
    await c.request("{ a }", {}, 500); // needs 500 points; ~5 available, restore 100/s → wait ≈ 4.95 s
    expect(sleep).toHaveBeenCalledTimes(1);
    const waited = (sleep.mock.calls[0] as unknown as [number])[0];
    expect(waited).toBeGreaterThan(4000);
    expect(waited).toBeLessThanOrEqual(5000);
  });

  it("rejects malformed shop domains", () => {
    expect(() => new AdminClient({ ...base, shopDomain: "evil.com/admin" })).toThrow(ShopifyError);
  });
});

describe("authentication helpers", () => {
  it("requests a client-credentials token and parses scopes/expiry", async () => {
    const f = fakeFetch([{ status: 200, body: { access_token: "shpat_x", scope: "read_orders,read_products", expires_in: 86399 } }]);
    const t = await requestClientCredentialsToken({ shopDomain: "example.myshopify.com", clientId: "id", clientSecret: "secret" }, f);
    expect(t.token).toBe("shpat_x");
    expect(t.scopes).toEqual(["read_orders", "read_products"]);
    expect(t.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 86_000_000);
    expect(f.calls[0]!.body).toContain("grant_type=client_credentials");
  });

  it("explains shop_not_permitted", async () => {
    const f = fakeFetch([{ status: 400, body: '{"error":"shop_not_permitted"}' }]);
    await expect(requestClientCredentialsToken({ shopDomain: "example.myshopify.com", clientId: "id", clientSecret: "s" }, f)).rejects.toThrow(/same Shopify organization/);
  });

  it("caches tokens until 5 minutes before expiry and dedupes concurrent refreshes", async () => {
    let n = 0;
    const p = new TokenProvider(async () => ({ token: `t${++n}`, scopes: [], expiresAt: new Date(Date.now() + 3600_000) }));
    const [a, b] = await Promise.all([p.get(), p.get()]);
    expect([a, b]).toEqual(["t1", "t1"]);
    expect(await p.get()).toBe("t1");
    const expiring = new TokenProvider(async () => ({ token: `e${++n}`, scopes: [], expiresAt: new Date(Date.now() + 60_000) }));
    expect(await expiring.get()).not.toBe(await expiring.get());
  });

  it("verifies webhook HMAC over the raw body", () => {
    const body = Buffer.from('{"id":1,"total":"10.00"}');
    const sig = createHmac("sha256", "whsec").update(body).digest("base64");
    expect(verifyWebhookHmac(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookHmac(Buffer.from('{"id":1,"total":"99.00"}'), sig, "whsec")).toBe(false);
    expect(verifyWebhookHmac(body, sig, "other")).toBe(false);
    expect(verifyWebhookHmac(body, null, "whsec")).toBe(false);
  });

  it("verifies OAuth query HMAC (sorted params, hex digest)", () => {
    const params = new URLSearchParams({ shop: "example.myshopify.com", code: "abc", state: "xyz", timestamp: "1792300000" });
    const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    params.set("hmac", createHmac("sha256", "secret").update(message).digest("hex"));
    expect(verifyOAuthQueryHmac(params, "secret")).toBe(true);
    params.set("code", "tampered");
    expect(verifyOAuthQueryHmac(params, "secret")).toBe(false);
  });

  it("parses webhook headers and rejects foreign shop domains", () => {
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    expect(parseWebhookHeaders(h({ "x-shopify-topic": "orders/updated", "x-shopify-shop-domain": "example.myshopify.com", "x-shopify-webhook-id": "w1" }))).toMatchObject({ topic: "orders/updated", webhookId: "w1" });
    expect(parseWebhookHeaders(h({ "x-shopify-topic": "orders/updated", "x-shopify-shop-domain": "evil.com", "x-shopify-webhook-id": "w1" }))).toBeNull();
  });
});

describe("product and shop mapping", () => {
  it("maps variant cost (cost per item) and converts weight to grams", () => {
    const p = mapProduct({
      id: "gid://shopify/Product/10",
      title: "Sneaker",
      status: "ACTIVE",
      productType: null,
      vendor: null,
      updatedAt: "2026-10-01T00:00:00Z",
      variants: [
        { id: "gid://shopify/ProductVariant/11", title: "Black / 8", sku: "SNK-8", price: "89.95", updatedAt: null, inventoryItem: { id: "gid://shopify/InventoryItem/111", requiresShipping: true, unitCost: { amount: "31.2", currencyCode: "AUD" }, measurement: { weight: { value: 1.5, unit: "POUNDS" } } } },
        { id: "gid://shopify/ProductVariant/12", title: "Black / 9", sku: "", price: "89.95", updatedAt: null, inventoryItem: { id: "gid://shopify/InventoryItem/112", requiresShipping: true, unitCost: null, measurement: null } },
      ],
    });
    expect(p.variants[0]).toMatchObject({ unitCost: "31.200000", weightGrams: 680, sku: "SNK-8" });
    expect(p.variants[1]).toMatchObject({ unitCost: null, sku: null }); // missing cost stays null (never 0)
  });

  it("derives the third-party fee rate from the plan when known", () => {
    const base = { id: "gid://shopify/Shop/1", name: "S", myshopifyDomain: "s.myshopify.com", currencyCode: "AUD", ianaTimezone: "Australia/Sydney", taxesIncluded: false };
    expect(mapShop({ ...base, plan: { displayName: "Basic", publicDisplayName: "Basic", shopifyPlus: false, partnerDevelopment: false } }).thirdPartyFeeRate).toBe("2.0");
    expect(mapShop({ ...base, plan: { displayName: "Shopify Plus", publicDisplayName: "Plus", shopifyPlus: true, partnerDevelopment: false } }).thirdPartyFeeRate).toBe("0");
    expect(mapShop({ ...base, plan: { displayName: "Unknown", publicDisplayName: null, shopifyPlus: false, partnerDevelopment: false } }).thirdPartyFeeRate).toBeNull();
  });
});
