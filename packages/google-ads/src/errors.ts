export type GoogleAdsErrorKind = "auth" | "permission" | "not_approved" | "quota" | "invalid" | "server" | "network" | "config";

/** Typed Google Ads / OAuth failure. `code` is the most specific Google error code (e.g. USER_PERMISSION_DENIED). */
export class GoogleAdsError extends Error {
  constructor(
    message: string,
    readonly kind: GoogleAdsErrorKind,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "GoogleAdsError";
  }

  get retryable(): boolean {
    return this.kind === "quota" || this.kind === "server" || this.kind === "network";
  }
}

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { "@type"?: string; errors?: { errorCode?: Record<string, string>; message?: string }[]; requestId?: string }[];
  };
}

/**
 * Converts a Google API error body into a GoogleAdsError. Google Ads specifics (GoogleAdsFailure) win over the
 * generic gRPC status, so e.g. CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION is reported with an actionable kind.
 */
export function errorFromBody(httpStatus: number, body: unknown): GoogleAdsError {
  const err = (Array.isArray(body) ? (body[0] as GoogleErrorBody) : (body as GoogleErrorBody))?.error;
  const failure = err?.details?.find((d) => d["@type"]?.endsWith("GoogleAdsFailure"));
  const first = failure?.errors?.[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : err?.status;
  const message = first?.message ?? err?.message ?? `Google Ads API error (HTTP ${httpStatus})`;
  const status = err?.status;
  let kind: GoogleAdsErrorKind;
  if (code === "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION") kind = "not_approved";
  else if (httpStatus === 401 || status === "UNAUTHENTICATED") kind = "auth";
  else if (httpStatus === 403 || status === "PERMISSION_DENIED") kind = "permission";
  else if (httpStatus === 429 || status === "RESOURCE_EXHAUSTED") kind = "quota";
  else if (httpStatus >= 500 || status === "UNAVAILABLE" || status === "INTERNAL" || status === "DEADLINE_EXCEEDED") kind = "server";
  else kind = "invalid";
  return new GoogleAdsError(message, kind, httpStatus, code, failure?.requestId);
}
