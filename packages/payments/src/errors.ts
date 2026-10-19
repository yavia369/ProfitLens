export type GatewayErrorKind = "auth" | "permission" | "quota" | "invalid" | "server" | "network" | "config";

/** Typed Stripe / PayPal API failure. */
export class GatewayApiError extends Error {
  constructor(
    message: string,
    readonly kind: GatewayErrorKind,
    readonly gateway: "stripe" | "paypal",
    readonly status?: number,
  ) {
    super(message);
    this.name = "GatewayApiError";
  }

  get retryable(): boolean {
    return this.kind === "quota" || this.kind === "server" || this.kind === "network";
  }
}

/** HTTP status → kind, per both providers' error docs (401 bad credentials, 403 missing permission, 429 rate limit). */
export function kindForStatus(status: number): GatewayErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 429) return "quota";
  if (status >= 500) return "server";
  return "invalid";
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
