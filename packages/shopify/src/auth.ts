import { createHmac, timingSafeEqual } from "node:crypto";
import type { FetchLike } from "./client";
import { SHOP_DOMAIN_RE } from "./client";
import { ShopifyError } from "./errors";

export interface AccessToken {
  readonly token: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
}

/**
 * Client credentials grant (apps acting on stores in their own Shopify organization).
 * https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
 */
export async function requestClientCredentialsToken(
  input: { shopDomain: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<AccessToken> {
  if (!SHOP_DOMAIN_RE.test(input.shopDomain)) throw new ShopifyError(`invalid shop domain: ${input.shopDomain}`, "config");
  const res = await fetchImpl(`https://${input.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: input.clientId, client_secret: input.clientSecret }).toString(),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    const kind = res.status >= 500 ? "server" : "auth";
    const hint = detail.includes("shop_not_permitted")
      ? " — the store is not in the same Shopify organization as the app (create the app from the store's own Dev Dashboard organization)"
      : "";
    throw new ShopifyError(`Token request failed (${res.status})${hint}`, kind, res.status, detail);
  }
  const body = (await res.json()) as { access_token?: string; scope?: string; expires_in?: number };
  if (!body.access_token) throw new ShopifyError("Token response had no access_token", "auth");
  return {
    token: body.access_token,
    scopes: (body.scope ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    expiresAt: typeof body.expires_in === "number" ? new Date(Date.now() + body.expires_in * 1000) : null,
  };
}

/** Caches a token in memory and refreshes it 5 minutes before expiry. */
export class TokenProvider {
  private current: AccessToken | null = null;
  private inflight: Promise<AccessToken> | null = null;

  constructor(private readonly fetchToken: () => Promise<AccessToken>, private readonly onToken?: (t: AccessToken) => void | Promise<void>) {}

  async get(): Promise<string> {
    const t = this.current;
    if (t && (t.expiresAt === null || t.expiresAt.getTime() - Date.now() > 5 * 60_000)) return t.token;
    this.inflight ??= this.fetchToken().then(async (fresh) => {
      this.current = fresh;
      await this.onToken?.(fresh);
      return fresh;
    }).finally(() => {
      this.inflight = null;
    });
    return (await this.inflight).token;
  }

  scopes(): readonly string[] {
    return this.current?.scopes ?? [];
  }
}

/** Verifies the `hmac` parameter Shopify adds to OAuth callback / app URLs (hex HMAC-SHA256 of sorted params). */
export function verifyOAuthQueryHmac(query: URLSearchParams, clientSecret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac || !/^[a-f0-9]{64}$/i.test(hmac)) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", clientSecret).update(message).digest("hex");
  const a = Buffer.from(digest, "hex");
  const b = Buffer.from(hmac, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifies `X-Shopify-Hmac-Sha256` (base64 HMAC-SHA256 of the raw request body). */
export function verifyWebhookHmac(rawBody: Buffer | string, headerValue: string | null, clientSecret: string): boolean {
  if (!headerValue) return false;
  const digest = createHmac("sha256", clientSecret).update(rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(headerValue, "base64");
  } catch {
    return false;
  }
  return provided.length === digest.length && timingSafeEqual(provided, digest);
}

export interface WebhookHeaders {
  readonly topic: string;
  readonly shopDomain: string;
  readonly webhookId: string;
  readonly apiVersion: string | null;
  readonly triggeredAt: string | null;
}

export function parseWebhookHeaders(get: (name: string) => string | null): WebhookHeaders | null {
  const topic = get("x-shopify-topic");
  const shopDomain = get("x-shopify-shop-domain");
  const webhookId = get("x-shopify-webhook-id") ?? get("x-shopify-event-id");
  if (!topic || !shopDomain || !webhookId || !SHOP_DOMAIN_RE.test(shopDomain)) return null;
  return { topic, shopDomain, webhookId, apiVersion: get("x-shopify-api-version"), triggeredAt: get("x-shopify-triggered-at") };
}
