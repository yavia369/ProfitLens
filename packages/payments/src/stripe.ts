import { dec, toMoneyString, type GatewayPayment } from "@profitlens/finance";
import { defaultSleep, GatewayApiError, kindForStatus, type FetchLike } from "./errors";

/** Pinned API version (VERIFIED 2026-10-19: 2026-09-30.endive is the latest in the versioning docs). */
export const STRIPE_API_VERSION = "2026-09-30.endive";
const BASE = "https://api.stripe.com/v1";

/**
 * Stripe amounts are integers in the smallest unit. JPY (VERIFIED) and Stripe's other zero-decimal currencies
 * (long-standing list, INFERRED: the docs page renders it dynamically) have no decimals; ISK and UGX are sent as
 * two-decimal values (VERIFIED). Three-decimal currencies are not converted (null) rather than guessed.
 */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
export function stripeMinorToAmount(minor: number, currency: string): string | null {
  const c = currency.toUpperCase();
  if (!Number.isSafeInteger(minor) || THREE_DECIMAL.has(c)) return null;
  return toMoneyString(dec(String(minor)).div(ZERO_DECIMAL.has(c) ? 1 : 100));
}

export interface RawStripeBalanceTransaction {
  id: string;
  amount: number;
  currency: string;
  fee: number;
  created: number;
  type: string;
  status: string;
  exchange_rate: number | null;
  /** Expanded with expand[]=data.source: the charge or payment as the customer paid it. */
  source: { id: string; object: string; amount: number; currency: string; created: number } | string | null;
}

/** A charge/payment as a GatewayPayment: gross as the customer paid it, fee in the balance currency. */
export function mapStripePayment(t: RawStripeBalanceTransaction): GatewayPayment | null {
  if (t.type !== "charge" && t.type !== "payment") return null;
  const src = typeof t.source === "object" && t.source ? t.source : null;
  const gross = src ? stripeMinorToAmount(src.amount, src.currency) : t.exchange_rate === null ? stripeMinorToAmount(t.amount, t.currency) : null;
  const fee = stripeMinorToAmount(t.fee, t.currency);
  if (gross === null || fee === null) return null;
  return {
    id: t.id,
    occurredAt: new Date((src?.created ?? t.created) * 1000),
    amount: gross,
    currency: (src?.currency ?? t.currency).toUpperCase(),
    fee,
    feeCurrency: t.currency.toUpperCase(),
  };
}

/** Read-only Stripe client (a restricted key with read access to balance transactions is enough). */
export class StripeClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly opts: { secretKey: string; fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; maxAttempts?: number }) {
    if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(opts.secretKey.trim())) throw new GatewayApiError("This is not a Stripe secret or restricted key (sk_… / rk_…).", "config", "stripe");
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private async get<T>(path: string, params: URLSearchParams): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let error: GatewayApiError;
      try {
        const res = await this.fetchImpl(`${BASE}/${path}?${params.toString()}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${this.opts.secretKey.trim()}`, "Stripe-Version": STRIPE_API_VERSION, Accept: "application/json" },
        });
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        if (res.ok) return json as T;
        error = new GatewayApiError(json?.error?.message ?? `Stripe error (HTTP ${res.status})`, kindForStatus(res.status), "stripe", res.status);
      } catch (e) {
        error = e instanceof GatewayApiError ? e : new GatewayApiError(`Network error calling Stripe: ${(e as Error).message}`, "network", "stripe");
      }
      if (!error.retryable || attempt >= (this.opts.maxAttempts ?? 5)) throw error;
      await this.sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    }
  }

  /** Balance transactions created in [from, to) with their source expanded, newest first, all pages. */
  async balanceTransactions(from: Date, to: Date): Promise<RawStripeBalanceTransaction[]> {
    const out: RawStripeBalanceTransaction[] = [];
    let after: string | undefined;
    for (;;) {
      const p = new URLSearchParams({ limit: "100", "created[gte]": String(Math.floor(from.getTime() / 1000)), "created[lt]": String(Math.floor(to.getTime() / 1000)), "expand[]": "data.source" });
      if (after) p.set("starting_after", after);
      const page = await this.get<{ data: RawStripeBalanceTransaction[]; has_more: boolean }>("balance_transactions", p);
      out.push(...page.data);
      if (!page.has_more || page.data.length === 0) return out;
      after = page.data[page.data.length - 1]!.id;
    }
  }
}
