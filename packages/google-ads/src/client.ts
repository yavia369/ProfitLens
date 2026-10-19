import { errorFromBody, GoogleAdsError } from "./errors";

/** Minimal fetch signature so tests can inject a fake transport. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** Google Ads API version (verified 2026-10-19: v26 is the latest, released 2026-10-14). */
export const GOOGLE_ADS_API_VERSION = "v26";
export const GOOGLE_ADS_BASE = "https://googleads.googleapis.com";

/** Google Ads customer IDs are 10 digits; users often type them as 123-456-7890. */
export function normalizeCustomerId(id: string): string {
  const digits = id.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(digits)) throw new GoogleAdsError(`"${id}" is not a Google Ads customer ID (10 digits).`, "config");
  return digits;
}

export interface GoogleAdsClientOptions {
  getAccessToken: () => Promise<string>;
  fetch?: FetchLike;
  apiVersion?: string;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** REST client for the Google Ads API (ARCHITECTURE §5): retries quota, 5xx and network errors with jittered backoff. */
export class GoogleAdsClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly version: string;

  constructor(private readonly opts: GoogleAdsClientOptions) {
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
    this.version = opts.apiVersion ?? GOOGLE_ADS_API_VERSION;
  }

  private async call<T>(method: "GET" | "POST", path: string, body: unknown, loginCustomerId: string | null): Promise<T> {
    const max = this.opts.maxAttempts ?? 5;
    for (let attempt = 1; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${await this.opts.getAccessToken()}`, Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (loginCustomerId) headers["login-customer-id"] = normalizeCustomerId(loginCustomerId);
      let error: GoogleAdsError;
      try {
        const res = await this.fetchImpl(`${GOOGLE_ADS_BASE}/${this.version}/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
        const json = await res.json().catch(() => null);
        if (res.ok) {
          // searchStream reports mid-stream failures inside the streamed array.
          const streamed = Array.isArray(json) ? (json.find((b) => b && typeof b === "object" && "error" in b) as { error: { code?: number } } | undefined) : undefined;
          if (streamed) throw errorFromBody(streamed.error.code ?? 500, streamed);
          return json as T;
        }
        error = errorFromBody(res.status, json);
      } catch (e) {
        error = e instanceof GoogleAdsError ? e : new GoogleAdsError(`Network error calling Google Ads: ${(e as Error).message}`, "network");
      }
      if (!error.retryable || attempt >= max) throw error;
      await this.sleep(Math.min(60_000, 1000 * 2 ** (attempt - 1)) * (0.5 + this.random()));
    }
  }

  /** Customer IDs the authenticated principal can access directly. */
  async listAccessibleCustomers(): Promise<string[]> {
    const r = await this.call<{ resourceNames?: string[] }>("GET", "customers:listAccessibleCustomers", undefined, null);
    return (r.resourceNames ?? []).map((n) => n.replace(/^customers\//, ""));
  }

  /** Runs a GAQL query with searchStream and returns all rows (camelCase JSON as Google returns it). */
  async searchStream<T>(customerId: string, query: string, loginCustomerId: string | null = null): Promise<T[]> {
    const batches = await this.call<{ results?: T[] }[]>("POST", `customers/${normalizeCustomerId(customerId)}/googleAds:searchStream`, { query }, loginCustomerId);
    return (batches ?? []).flatMap((b) => b.results ?? []);
  }
}
