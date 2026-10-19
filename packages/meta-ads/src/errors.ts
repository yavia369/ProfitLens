export type MetaAdsErrorKind = "auth" | "permission" | "quota" | "invalid" | "server" | "network" | "config";

/**
 * Typed Marketing API failure (VERIFIED against the v26 error reference and rate-limiting pages, 2026-10-19):
 * 190 invalid token and 2500 missing token (live, 2026-10-19) → auth; 10 and 200–299 → permission; 4 (app), 17 / 613 (account), 32 and 80000–80014
 * (business use case) → quota; `is_transient` or 1–2 → server; everything else (e.g. 100) → invalid.
 */
export class MetaAdsError extends Error {
  constructor(
    message: string,
    readonly kind: MetaAdsErrorKind,
    readonly status?: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = "MetaAdsError";
  }

  get retryable(): boolean {
    return this.kind === "quota" || this.kind === "server" || this.kind === "network";
  }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string; fbtrace_id?: string };
}

export function errorFromBody(httpStatus: number, body: unknown): MetaAdsError {
  const e = (body as GraphErrorBody | null)?.error;
  const code = e?.code;
  const message = e?.error_user_msg ?? e?.message ?? `Meta Marketing API error (HTTP ${httpStatus})`;
  let kind: MetaAdsErrorKind;
  if (code === 190 || code === 2500 || httpStatus === 401) kind = "auth";
  else if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== undefined && code >= 80000 && code <= 80014) || httpStatus === 429) kind = "quota";
  else if (code === 10 || (code !== undefined && code >= 200 && code <= 299) || httpStatus === 403) kind = "permission";
  else if (e?.is_transient || code === 1 || code === 2 || httpStatus >= 500) kind = "server";
  else kind = "invalid";
  return new MetaAdsError(message, kind, httpStatus, code, e?.error_subcode, e?.fbtrace_id);
}
