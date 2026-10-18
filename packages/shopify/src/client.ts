import { ShopifyError } from "./errors";

/** Minimal fetch signature so tests can inject a fake transport. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface GraphqlCost {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: ThrottleStatus;
}

export interface AdminClientOptions {
  shopDomain: string; // example.myshopify.com
  apiVersion: string; // e.g. 2026-10
  getAccessToken: () => Promise<string>;
  fetch?: FetchLike;
  maxAttempts?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * GraphQL Admin API client with cost-aware throttling (leaky bucket) and retry with exponential backoff
 * and jitter for throttling, 5xx and network errors (ARCHITECTURE §4).
 */
export class AdminClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private lastThrottle: ThrottleStatus | null = null;
  private lastThrottleAt = 0;

  constructor(private readonly opts: AdminClientOptions) {
    if (!SHOP_DOMAIN_RE.test(opts.shopDomain)) throw new ShopifyError(`invalid shop domain: ${opts.shopDomain}`, "config");
    if (!/^\d{4}-(01|04|07|10)$/.test(opts.apiVersion)) throw new ShopifyError(`invalid API version: ${opts.apiVersion}`, "config");
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
  }

  get endpoint(): string {
    return `https://${this.opts.shopDomain}/admin/api/${this.opts.apiVersion}/graphql.json`;
  }

  /** Estimated points available now, based on the last reported bucket state and restore rate. */
  private estimatedAvailable(now: number): number | null {
    if (!this.lastThrottle) return null;
    const t = this.lastThrottle;
    return Math.min(t.maximumAvailable, t.currentlyAvailable + ((now - this.lastThrottleAt) / 1000) * t.restoreRate);
  }

  private backoff(attempt: number): number {
    const base = Math.min(30_000, 500 * 2 ** (attempt - 1));
    return Math.round(base / 2 + this.random() * (base / 2));
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}, expectedCost = 50): Promise<{ data: T; cost: GraphqlCost | null }> {
    const maxAttempts = this.opts.maxAttempts ?? 8;
    for (let attempt = 1; ; attempt++) {
      // Wait proactively when the bucket is likely too empty for this query.
      const available = this.estimatedAvailable(Date.now());
      if (available !== null && available < expectedCost && this.lastThrottle) {
        const waitMs = Math.ceil(((expectedCost - available) / this.lastThrottle.restoreRate) * 1000);
        this.opts.log?.("shopify.throttle.wait", { waitMs, available, expectedCost });
        await this.sleep(waitMs);
      }
      let error: ShopifyError;
      try {
        const res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Shopify-Access-Token": await this.opts.getAccessToken(),
          },
          body: JSON.stringify({ query, variables }),
        });
        if (res.status === 401 || res.status === 403) {
          throw new ShopifyError(`Shopify rejected the credentials (${res.status})`, "auth", res.status, await safeText(res));
        }
        if (res.status === 429) {
          error = new ShopifyError("HTTP 429 from Shopify", "throttled", 429);
          const retryAfter = Number(res.headers.get("Retry-After"));
          if (attempt < maxAttempts && Number.isFinite(retryAfter) && retryAfter > 0) {
            await this.sleep(retryAfter * 1000);
            continue;
          }
        } else if (res.status >= 500) {
          error = new ShopifyError(`Shopify server error ${res.status}`, "server", res.status);
        } else if (!res.ok) {
          throw new ShopifyError(`Shopify request failed with ${res.status}`, "graphql", res.status, await safeText(res));
        } else {
          const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[]; extensions?: { cost?: GraphqlCost } };
          const cost = body.extensions?.cost ?? null;
          if (cost?.throttleStatus) {
            this.lastThrottle = cost.throttleStatus;
            this.lastThrottleAt = Date.now();
          }
          const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
          if (throttled) {
            error = new ShopifyError("Query throttled by Shopify", "throttled", 200, body.errors);
          } else if (body.errors?.length) {
            const denied = body.errors.some((e) => e.extensions?.code === "ACCESS_DENIED");
            throw new ShopifyError(`GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`, denied ? "auth" : "graphql", 200, body.errors);
          } else if (!body.data) {
            throw new ShopifyError("GraphQL response without data", "graphql", 200, body);
          } else {
            return { data: body.data, cost };
          }
        }
      } catch (e) {
        if (e instanceof ShopifyError) {
          if (!e.retryable) throw e;
          error = e;
        } else {
          error = new ShopifyError(`Network error: ${(e as Error).message}`, "network");
        }
      }
      if (attempt >= maxAttempts) throw error;
      const delay = this.backoff(attempt);
      this.opts.log?.("shopify.retry", { attempt, delay, kind: error.kind, status: error.status });
      await this.sleep(delay);
    }
  }
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
