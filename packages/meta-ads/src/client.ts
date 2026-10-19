import { createHmac } from "node:crypto";
import { errorFromBody, MetaAdsError } from "./errors";

/** Minimal fetch signature so tests can inject a fake transport. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Graph / Marketing API version (VERIFIED 2026-10-19: v26.0 released 2026-07-29 is the latest). */
export const META_API_VERSION = "v26.0";
export const META_GRAPH_BASE = "https://graph.facebook.com";

/** Ad account ids are numeric; the API path uses `act_<id>`. Accepts either form. */
export function normalizeAdAccountId(id: string): string {
  const digits = id.trim().replace(/^act_/, "");
  if (!/^\d{1,20}$/.test(digits)) throw new MetaAdsError(`"${id}" is not a Meta ad account ID.`, "config");
  return digits;
}

export interface MetaAdsClientOptions {
  accessToken: string;
  /** When set, every call carries appsecret_proof (required by apps with "Require App Secret"). */
  appSecret?: string;
  fetch?: FetchLike;
  apiVersion?: string;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

interface Page<T> {
  data?: T[];
  paging?: { next?: string };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Read-only Marketing API client. The token travels in the Authorization header (never in URLs or logs);
 * quota, transient and network errors are retried with jittered exponential backoff; `paging.next` is followed
 * only on graph.facebook.com.
 */
export class MetaAdsClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly version: string;

  constructor(private readonly opts: MetaAdsClientOptions) {
    if (!/^\S{20,}$/.test(opts.accessToken)) throw new MetaAdsError("This is not a Meta access token.", "config");
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
    this.version = opts.apiVersion ?? META_API_VERSION;
  }

  private async get<T>(url: string): Promise<T> {
    const max = this.opts.maxAttempts ?? 5;
    for (let attempt = 1; ; attempt++) {
      let error: MetaAdsError;
      try {
        const res = await this.fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${this.opts.accessToken}`, Accept: "application/json" } });
        const json = await res.json().catch(() => null);
        if (res.ok && !(json && typeof json === "object" && "error" in json)) return json as T;
        error = errorFromBody(res.status, json);
      } catch (e) {
        error = e instanceof MetaAdsError ? e : new MetaAdsError(`Network error calling Meta: ${(e as Error).message}`, "network");
      }
      if (!error.retryable || attempt >= max) throw error;
      await this.sleep(Math.min(120_000, 2000 * 2 ** (attempt - 1)) * (0.5 + this.random()));
    }
  }

  private url(path: string, params: Record<string, string>): string {
    return this.signed(new URL(`${META_GRAPH_BASE}/${this.version}/${path}?${new URLSearchParams(params).toString()}`));
  }

  /** Adds appsecret_proof = HMAC-SHA256(token, app secret) when an app secret is configured. */
  private signed(u: URL): string {
    if (this.opts.appSecret) u.searchParams.set("appsecret_proof", createHmac("sha256", this.opts.appSecret).update(this.opts.accessToken).digest("hex"));
    return u.toString();
  }

  /** Follows cursor pagination; refuses to follow links off the Graph host and drops any token in them. */
  private async all<T>(first: string): Promise<T[]> {
    const out: T[] = [];
    for (let next: string | undefined = first; next; ) {
      const page: Page<T> = await this.get<Page<T>>(next);
      out.push(...(page.data ?? []));
      const n = page.paging?.next;
      if (!n) break;
      const u = new URL(n);
      if (u.hostname !== new URL(META_GRAPH_BASE).hostname) throw new MetaAdsError("Unexpected pagination host from Meta.", "invalid");
      u.searchParams.delete("access_token");
      next = this.signed(u);
    }
    return out;
  }

  /**
   * Refreshes an expiring (60-day) system-user token (VERIFIED in the system-user docs, 2026-10-19):
   * GET oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&set_token_expires_in_60_days=true.
   */
  static async refreshSystemUserToken(
    input: { accessToken: string; appId: string; appSecret: string },
    opts: { fetch?: FetchLike; apiVersion?: string } = {},
  ): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: input.appId,
      client_secret: input.appSecret,
      set_token_expires_in_60_days: "true",
      fb_exchange_token: input.accessToken,
    });
    const fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetchImpl(`${META_GRAPH_BASE}/${opts.apiVersion ?? META_API_VERSION}/oauth/access_token?${params.toString()}`, { method: "GET", headers: { Accept: "application/json" } });
    } catch (e) {
      throw new MetaAdsError(`Network error refreshing the Meta token: ${(e as Error).message}`, "network");
    }
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: unknown } | null;
    if (!res.ok || !json?.access_token) throw errorFromBody(res.status, json);
    return { accessToken: json.access_token, expiresInSeconds: typeof json.expires_in === "number" ? json.expires_in : null };
  }

  /** The token's user (a system user for D-051). */
  async me(): Promise<{ id: string; name: string }> {
    return this.get(this.url("me", { fields: "id,name" }));
  }

  async adAccounts<T>(fields: string): Promise<T[]> {
    return this.all<T>(this.url("me/adaccounts", { fields, limit: "100" }));
  }

  /** Daily campaign insights for [since, until] (inclusive, ad account time zone). */
  async campaignInsightsDaily<T>(adAccountId: string, since: string, until: string, fields: string): Promise<T[]> {
    return this.all<T>(
      this.url(`act_${normalizeAdAccountId(adAccountId)}/insights`, {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields,
        // Values as Ads Manager shows them (the account's attribution setting).
        use_account_attribution_setting: "true",
        limit: "500",
      }),
    );
  }
}
