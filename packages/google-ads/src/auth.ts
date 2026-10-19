import { createSign } from "node:crypto";
import { GoogleAdsError } from "./errors";
import type { FetchLike } from "./client";

export const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface ServiceAccountKey {
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly tokenUri: string;
  readonly projectId: string | null;
}

/**
 * Reads a Google Cloud service account key given as the JSON file contents (any whitespace) or base64 of it.
 * Only the fields needed for the JWT bearer flow are kept.
 */
export function parseServiceAccountKey(raw: string): ServiceAccountKey {
  const text = raw.trim();
  let json: unknown;
  try {
    json = JSON.parse(text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8"));
  } catch {
    throw new GoogleAdsError("The service account key is not valid JSON (or base64 of it).", "config");
  }
  const k = json as Record<string, unknown>;
  if (k.type !== "service_account" || typeof k.client_email !== "string" || typeof k.private_key !== "string") {
    throw new GoogleAdsError('This is not a service account key (expected "type": "service_account" with client_email and private_key).', "config");
  }
  if (!k.private_key.includes("BEGIN PRIVATE KEY")) throw new GoogleAdsError("The service account key has no private key.", "config");
  return {
    clientEmail: k.client_email,
    privateKey: k.private_key,
    tokenUri: typeof k.token_uri === "string" ? k.token_uri : TOKEN_URL,
    projectId: typeof k.project_id === "string" ? k.project_id : null,
  };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** Signed JWT assertion for the OAuth 2.0 JWT bearer grant (RFC 7523), valid for one hour. */
export function serviceAccountAssertion(key: ServiceAccountKey, nowSeconds: number, scope = ADWORDS_SCOPE): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.clientEmail, scope, aud: key.tokenUri, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.privateKey);
  return `${header}.${claims}.${b64url(signature)}`;
}

export interface AccessToken {
  readonly token: string;
  readonly expiresAt: number; // epoch ms
}

async function tokenRequest(fetchImpl: FetchLike, url: string, form: Record<string, string>, now: () => number): Promise<AccessToken & { scope?: string }> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  } catch (e) {
    throw new GoogleAdsError(`Could not reach Google sign-in: ${(e as Error).message}`, "network");
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const kind = res.status >= 500 ? "server" : "auth";
    throw new GoogleAdsError(`Google sign-in failed: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`, kind, res.status, body.error);
  }
  return { token: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000, ...(body.scope ? { scope: body.scope } : {}) };
}

/** Caches an access token and renews it 5 minutes before expiry. */
export class TokenProvider {
  private cached: AccessToken | null = null;
  private inflight: Promise<AccessToken> | null = null;

  constructor(
    private readonly fetchToken: () => Promise<AccessToken>,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<string> {
    if (this.cached && this.cached.expiresAt - 5 * 60_000 > this.now()) return this.cached.token;
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = null;
    });
    this.cached = await this.inflight;
    return this.cached.token;
  }
}

/** Service account (server-to-server) access tokens: no user interaction (owner's own accounts, D-041). */
export function serviceAccountTokens(key: ServiceAccountKey, fetchImpl: FetchLike, now: () => number = Date.now): TokenProvider {
  return new TokenProvider(
    () =>
      tokenRequest(fetchImpl, key.tokenUri, {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(key, Math.floor(now() / 1000)),
      }, now),
    now,
  );
}
