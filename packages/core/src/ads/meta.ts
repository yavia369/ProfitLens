import { assertRole, schema, TenantAccessError, type OrgScope } from "@profitlens/db";
import { AD_ACCOUNT_FIELDS, mapAdAccount, MetaAdsClient, MetaAdsError, type FetchLike, type RawAdAccount } from "@profitlens/meta-ads";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../security/crypto";
import type { AdsDeps } from "./connection";

const keyContext = (connectionId: string) => `ad_connection:${connectionId}:credentials`;

/** What is stored (encrypted) for a Meta connection. App credentials are only needed for expiring tokens. */
interface MetaCredentials {
  accessToken: string;
  appId?: string;
  appSecret?: string;
  /** ISO instant; null when unknown (e.g. a non-expiring token). */
  expiresAt?: string | null;
}

/** Expiring tokens are refreshed when fewer than this many days are left (they last 60). */
export const META_REFRESH_BEFORE_DAYS = 15;

function client(deps: AdsDeps, c: MetaCredentials): MetaAdsClient {
  return new MetaAdsClient({
    accessToken: c.accessToken.trim(),
    ...(c.appSecret ? { appSecret: c.appSecret } : {}),
    ...(deps.fetch ? { fetch: deps.fetch as unknown as FetchLike } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
  });
}

async function refreshed(deps: AdsDeps, c: MetaCredentials): Promise<MetaCredentials> {
  if (!c.appId || !c.appSecret) return c;
  const now = deps.now?.() ?? new Date();
  const r = await MetaAdsClient.refreshSystemUserToken({ accessToken: c.accessToken, appId: c.appId, appSecret: c.appSecret }, deps.fetch ? { fetch: deps.fetch as unknown as FetchLike } : {});
  return { ...c, accessToken: r.accessToken, expiresAt: r.expiresInSeconds ? new Date(now.getTime() + r.expiresInSeconds * 1000).toISOString() : null };
}

function readCredentials(deps: AdsDeps, connection: { id: string; credentialsEnc: string }): MetaCredentials {
  const raw = decryptSecret(deps.keyring, connection.credentialsEnc, keyContext(connection.id));
  return raw.startsWith("{") ? (JSON.parse(raw) as MetaCredentials) : { accessToken: raw };
}

/**
 * Client for a stored Meta connection. An expiring token with app credentials is refreshed (and re-stored)
 * when it is within META_REFRESH_BEFORE_DAYS of expiry, so syncs never run into a dead token.
 */
export async function metaClientForConnection(deps: AdsDeps, connectionId: string): Promise<MetaAdsClient> {
  const [connection] = await deps.db.select().from(schema.adConnection).where(eq(schema.adConnection.id, connectionId));
  if (!connection?.credentialsEnc) throw new MetaAdsError("Meta connection has no stored token.", "config");
  let creds = readCredentials(deps, { id: connection.id, credentialsEnc: connection.credentialsEnc });
  const now = (deps.now?.() ?? new Date()).getTime();
  if (creds.appId && creds.appSecret && creds.expiresAt && new Date(creds.expiresAt).getTime() - now < META_REFRESH_BEFORE_DAYS * 86_400_000) {
    creds = await refreshed(deps, creds);
    await deps.db
      .update(schema.adConnection)
      .set({ credentialsEnc: encryptSecret(deps.keyring, JSON.stringify(creds), keyContext(connection.id)), updatedAt: new Date() })
      .where(eq(schema.adConnection.id, connection.id));
  }
  return client(deps, creds);
}

export interface MetaConnectResult {
  readonly connectionId: string;
  readonly userName: string;
  readonly accounts: readonly { id: string; accountId: string; name: string; currency: string; timezone: string; status: string; storeId: string | null }[];
}

/**
 * Connects Meta with a Business Manager system-user token that has ads_read on the owner's ad accounts (D-051):
 * the token is checked against /me, stored encrypted, and the ad accounts it can read are discovered. A non-expiring
 * token needs nothing else; an expiring (60-day) token needs the app ID and secret so it can be refreshed.
 * Reconnecting with a new token for the same system user replaces the stored credentials.
 */
export async function connectMetaSystemUser(deps: AdsDeps, scope: OrgScope, input: { accessToken: string; appId?: string | null; appSecret?: string | null }): Promise<MetaConnectResult> {
  assertRole(scope, "admin");
  const appId = input.appId?.trim() || undefined;
  const appSecret = input.appSecret?.trim() || undefined;
  if (Boolean(appId) !== Boolean(appSecret)) throw new MetaAdsError("Enter both the app ID and the app secret, or neither (non-expiring token).", "config");
  if (appId && !/^\d{5,25}$/.test(appId)) throw new MetaAdsError("The app ID is a number (App Dashboard → App settings → Basic).", "config");
  // With app credentials the token is exchanged right away: this proves the pairing and records the expiry.
  const creds = await refreshed(deps, { accessToken: input.accessToken.trim(), ...(appId && appSecret ? { appId, appSecret } : {}) });
  const me = await client(deps, creds).me();
  const connectionId = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.adConnection)
      .values({ organizationId: scope.organizationId, platform: "meta", externalUserId: me.id, displayName: me.name, authType: "system_user", status: "active" })
      .onConflictDoUpdate({
        target: [schema.adConnection.organizationId, schema.adConnection.platform, schema.adConnection.externalUserId],
        set: { displayName: me.name, status: "active", lastError: null, authType: "system_user", updatedAt: new Date() },
      })
      .returning({ id: schema.adConnection.id });
    await tx.update(schema.adConnection).set({ credentialsEnc: encryptSecret(deps.keyring, JSON.stringify(creds), keyContext(row!.id)) }).where(eq(schema.adConnection.id, row!.id));
    await tx.insert(schema.auditLog).values({
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      action: "ads.connect",
      entityType: "ad_connection",
      entityId: row!.id,
      after: { platform: "meta", systemUser: me.id, name: me.name, expiringToken: Boolean(appId), expiresAt: creds.expiresAt ?? null },
    });
    return row!.id;
  });
  const accounts = await discoverMetaAccounts(deps, scope, connectionId);
  if (accounts.length === 0) {
    throw new MetaAdsError(`${me.name} can't see any ad account yet. In Business Settings, assign the ad account to this system user (View performance is enough).`, "permission");
  }
  return { connectionId, userName: me.name, accounts };
}

/** Lists the ad accounts the token can read and upserts them, keeping store mappings and sync settings. */
export async function discoverMetaAccounts(deps: AdsDeps, scope: OrgScope, connectionId: string): Promise<MetaConnectResult["accounts"]> {
  const [connection] = await deps.db.select().from(schema.adConnection).where(eq(schema.adConnection.id, connectionId));
  if (!connection || connection.organizationId !== scope.organizationId) throw new TenantAccessError("connection not in this organization");
  const raw = await (await metaClientForConnection(deps, connectionId)).adAccounts<RawAdAccount>(AD_ACCOUNT_FIELDS);
  const out: MetaConnectResult["accounts"][number][] = [];
  for (const a of raw.map(mapAdAccount)) {
    const [row] = await deps.db
      .insert(schema.adAccount)
      .values({ organizationId: scope.organizationId, connectionId, platform: "meta", externalId: a.accountId, name: a.name, currency: a.currency, timezone: a.timezone, isManager: false, accountStatus: a.status })
      .onConflictDoUpdate({
        target: [schema.adAccount.organizationId, schema.adAccount.platform, schema.adAccount.externalId],
        set: { connectionId, name: a.name, currency: a.currency, timezone: a.timezone, accountStatus: a.status, updatedAt: new Date() },
      })
      .returning({ id: schema.adAccount.id, storeId: schema.adAccount.storeId });
    out.push({ ...a, id: row!.id, storeId: row!.storeId });
  }
  return out;
}
