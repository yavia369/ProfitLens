import { dec, toMoneyString, type GatewayPayment } from "@profitlens/finance";
import { defaultSleep, GatewayApiError, kindForStatus, type FetchLike } from "./errors";

const BASE = "https://api-m.paypal.com";
/** Transaction Search accepts at most 31 days per request (VERIFIED, reporting_transactions_v1 spec 1.9). */
export const PAYPAL_MAX_RANGE_DAYS = 31;

export interface RawPayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_event_code?: string;
    transaction_initiation_date?: string;
    transaction_amount?: { currency_code: string; value: string };
    fee_amount?: { currency_code: string; value: string };
    transaction_status?: string;
  };
}

/** PayPal dates may carry "+0000"-style offsets; normalise to something Date parses. */
function parseDate(s: string): Date {
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(d.getTime())) throw new GatewayApiError(`unexpected PayPal date ${s}`, "invalid", "paypal");
  return d;
}

/**
 * A received payment as a GatewayPayment: event codes T00xx (payments, INFERRED from PayPal's event-code
 * families; the code list page is not machine-readable here) with a positive amount and status S (success).
 * `fee_amount` appears only when a fee was applied (VERIFIED spec note), so its absence is a zero fee.
 */
export function mapPayPalPayment(t: RawPayPalTransaction): GatewayPayment | null {
  const i = t.transaction_info;
  if (!i.transaction_event_code?.startsWith("T00") || i.transaction_status !== "S" || !i.transaction_amount || !i.transaction_initiation_date) return null;
  const gross = dec(i.transaction_amount.value);
  if (gross.lte(0)) return null;
  return {
    id: i.transaction_id,
    occurredAt: parseDate(i.transaction_initiation_date),
    amount: toMoneyString(gross),
    currency: i.transaction_amount.currency_code.toUpperCase(),
    fee: toMoneyString(i.fee_amount ? dec(i.fee_amount.value).abs() : dec("0")),
    feeCurrency: (i.fee_amount?.currency_code ?? i.transaction_amount.currency_code).toUpperCase(),
  };
}

/** Read-only PayPal client: client-credentials token with the Transaction Search scope. */
export class PayPalClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly opts: { clientId: string; clientSecret: string; fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; now?: () => number; maxAttempts?: number }) {
    if (opts.clientId.trim().length < 10 || opts.clientSecret.trim().length < 10) throw new GatewayApiError("Enter the PayPal REST app's client ID and secret.", "config", "paypal");
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private async request<T>(method: "GET" | "POST", path: string, headers: Record<string, string>, body?: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let error: GatewayApiError;
      try {
        const res = await this.fetchImpl(`${BASE}${path}`, { method, headers: { Accept: "application/json", ...headers }, ...(body ? { body } : {}) });
        const json = (await res.json().catch(() => null)) as { message?: string; error_description?: string; name?: string } | null;
        if (res.ok) return json as T;
        error = new GatewayApiError(json?.error_description ?? json?.message ?? `PayPal error (HTTP ${res.status})`, kindForStatus(res.status), "paypal", res.status);
      } catch (e) {
        error = e instanceof GatewayApiError ? e : new GatewayApiError(`Network error calling PayPal: ${(e as Error).message}`, "network", "paypal");
      }
      if (!error.retryable || attempt >= (this.opts.maxAttempts ?? 5)) throw error;
      await this.sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    }
  }

  async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > this.now()) return this.token.value;
    const basic = Buffer.from(`${this.opts.clientId.trim()}:${this.opts.clientSecret.trim()}`).toString("base64");
    const r = await this.request<{ access_token: string; expires_in: number }>("POST", "/v1/oauth2/token", { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, "grant_type=client_credentials");
    this.token = { value: r.access_token, expiresAt: this.now() + r.expires_in * 1000 };
    return r.access_token;
  }

  /** Transactions in [from, to) — at most 31 days; all pages (page_size 500). */
  async transactions(from: Date, to: Date): Promise<RawPayPalTransaction[]> {
    if (to.getTime() - from.getTime() > PAYPAL_MAX_RANGE_DAYS * 86_400_000) throw new GatewayApiError("PayPal searches cover at most 31 days.", "config", "paypal");
    const out: RawPayPalTransaction[] = [];
    for (let page = 1; ; page++) {
      const p = new URLSearchParams({ start_date: from.toISOString().replace(/\.\d{3}Z$/, "Z"), end_date: to.toISOString().replace(/\.\d{3}Z$/, "Z"), fields: "transaction_info", page_size: "500", page: String(page) });
      const r = await this.request<{ transaction_details?: RawPayPalTransaction[]; total_pages?: number }>("GET", `/v1/reporting/transactions?${p.toString()}`, { Authorization: `Bearer ${await this.accessToken()}` });
      out.push(...(r.transaction_details ?? []));
      if (!r.total_pages || page >= r.total_pages) return out;
    }
  }
}
