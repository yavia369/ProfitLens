import { assertRole, assertStoresInScope, schema, TenantAccessError, type Database, type OrgScope } from "@profitlens/db";
import {
  CUSTOMER_CLIENTS_QUERY,
  CUSTOMER_QUERY,
  GoogleAdsClient,
  GoogleAdsError,
  mapCustomer,
  mapCustomerClient,
  normalizeCustomerId,
  parseServiceAccountKey,
  serviceAccountTokens,
  type AdAccountFacts,
  type FetchLike,
  type RawCustomerClientRow,
  type RawCustomerRow,
} from "@profitlens/google-ads";
import { MetaAdsError, SYNCABLE_STATUSES as META_SYNCABLE_STATUSES } from "@profitlens/meta-ads";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, type KeyRing } from "../security/crypto";

export interface AdsDeps {
  readonly db: Database;
  readonly keyring: KeyRing;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

const keyContext = (connectionId: string) => `ad_connection:${connectionId}:credentials`;

export interface ConnectedClient {
  readonly client: GoogleAdsClient;
  readonly connection: typeof schema.adConnection.$inferSelect;
}

function clientFor(deps: AdsDeps, keyJson: string): GoogleAdsClient {
  const tokens = serviceAccountTokens(parseServiceAccountKey(keyJson), deps.fetch ?? (globalThis.fetch as unknown as FetchLike), () => (deps.now?.() ?? new Date()).getTime());
  return new GoogleAdsClient({ getAccessToken: () => tokens.get(), ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}) });
}

export async function clientForConnection(deps: AdsDeps, connectionId: string): Promise<ConnectedClient> {
  const [connection] = await deps.db.select().from(schema.adConnection).where(eq(schema.adConnection.id, connectionId));
  if (!connection?.credentialsEnc) throw new GoogleAdsError("Google Ads connection has no stored credentials.", "config");
  return { client: clientFor(deps, decryptSecret(deps.keyring, connection.credentialsEnc, keyContext(connection.id))), connection };
}

export interface ConnectResult {
  readonly connectionId: string;
  readonly serviceAccountEmail: string;
  readonly accounts: readonly (AdAccountFacts & { readonly id: string; readonly storeId: string | null })[];
}

/**
 * Connects Google Ads with a service account key (D-041): verifies it can reach Google Ads, stores the key
 * encrypted, and discovers the accounts it can read. Re-connecting with the same service account updates it.
 */
export async function connectGoogleAdsServiceAccount(deps: AdsDeps, scope: OrgScope, input: { keyJson: string; loginCustomerId?: string | null }): Promise<ConnectResult> {
  assertRole(scope, "admin");
  const key = parseServiceAccountKey(input.keyJson);
  const login = input.loginCustomerId?.trim() ? normalizeCustomerId(input.loginCustomerId) : null;
  const client = clientFor(deps, input.keyJson);
  const accessible = await client.listAccessibleCustomers();
  if (accessible.length === 0) {
    throw new GoogleAdsError(`${key.clientEmail} has no access to any Google Ads account yet. Add it as a user in Google Ads (Admin → Access and security).`, "permission");
  }
  if (login && !accessible.includes(login)) {
    throw new GoogleAdsError(`The manager account ${login} is not accessible to ${key.clientEmail}.`, "permission");
  }
  const connectionId = await deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.adConnection)
      .values({ organizationId: scope.organizationId, platform: "google_ads", externalUserId: key.clientEmail, displayName: key.clientEmail, authType: "service_account", loginCustomerId: login, status: "active" })
      .onConflictDoUpdate({
        target: [schema.adConnection.organizationId, schema.adConnection.platform, schema.adConnection.externalUserId],
        set: { loginCustomerId: login, status: "active", lastError: null, authType: "service_account", updatedAt: new Date() },
      })
      .returning({ id: schema.adConnection.id });
    await tx.update(schema.adConnection).set({ credentialsEnc: encryptSecret(deps.keyring, input.keyJson, keyContext(row!.id)) }).where(eq(schema.adConnection.id, row!.id));
    await tx.insert(schema.auditLog).values({
      organizationId: scope.organizationId,
      actorUserId: scope.userId,
      action: "ads.connect",
      entityType: "ad_connection",
      entityId: row!.id,
      after: { platform: "google_ads", serviceAccount: key.clientEmail, loginCustomerId: login },
    });
    return row!.id;
  });
  return { connectionId, serviceAccountEmail: key.clientEmail, accounts: await discoverAccounts(deps, scope, connectionId) };
}

/**
 * Lists the ad accounts a connection can read (managers' direct children included) and upserts them.
 * Existing store mappings and sync settings are kept.
 */
export async function discoverAccounts(deps: AdsDeps, scope: OrgScope, connectionId: string): Promise<ConnectResult["accounts"]> {
  const { client, connection } = await clientForConnection(deps, connectionId);
  if (connection.organizationId !== scope.organizationId) throw new TenantAccessError("connection not in this organization");
  const found = new Map<string, AdAccountFacts & { login: string | null }>();
  const roots = connection.loginCustomerId ? [connection.loginCustomerId] : await client.listAccessibleCustomers();
  for (const customerId of roots) {
    let me: AdAccountFacts;
    try {
      const [row] = await client.searchStream<RawCustomerRow>(customerId, CUSTOMER_QUERY, connection.loginCustomerId);
      if (!row) continue;
      me = mapCustomer(row);
    } catch (e) {
      // A cancelled or restricted account must not block the others.
      if (e instanceof GoogleAdsError && (e.kind === "permission" || e.kind === "invalid")) continue;
      throw e;
    }
    found.set(me.customerId, { ...me, login: connection.loginCustomerId });
    if (me.isManager) {
      const children = await client.searchStream<RawCustomerClientRow>(customerId, CUSTOMER_CLIENTS_QUERY, connection.loginCustomerId ?? customerId);
      for (const c of children.map(mapCustomerClient)) {
        if (c.customerId !== me.customerId && !found.has(c.customerId)) found.set(c.customerId, { ...c, login: connection.loginCustomerId ?? customerId });
      }
    }
  }
  const out: ConnectResult["accounts"][number][] = [];
  for (const a of found.values()) {
    const [row] = await deps.db
      .insert(schema.adAccount)
      .values({
        organizationId: scope.organizationId,
        connectionId,
        platform: "google_ads",
        externalId: a.customerId,
        loginCustomerId: a.login,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone,
        isManager: a.isManager,
        accountStatus: a.status,
      })
      .onConflictDoUpdate({
        target: [schema.adAccount.organizationId, schema.adAccount.platform, schema.adAccount.externalId],
        set: { connectionId, loginCustomerId: a.login, name: a.name, currency: a.currency, timezone: a.timezone, isManager: a.isManager, accountStatus: a.status, updatedAt: new Date() },
      })
      .returning({ id: schema.adAccount.id, storeId: schema.adAccount.storeId });
    const { login: _login, ...facts } = a;
    out.push({ ...facts, id: row!.id, storeId: row!.storeId });
  }
  return out;
}

/**
 * Assigns an ad account to a store (one account → one store in M1) and turns syncing on or off.
 * Returns whether the account still needs its historical import.
 */
export async function mapAdAccount(db: Database, scope: OrgScope, accountId: string, input: { storeId: string | null; syncEnabled: boolean }): Promise<{ needsBackfill: boolean }> {
  assertRole(scope, "admin");
  const [acct] = await db.select().from(schema.adAccount).where(and(eq(schema.adAccount.id, accountId), eq(schema.adAccount.organizationId, scope.organizationId)));
  if (!acct) throw new TenantAccessError("ad account not found");
  if (input.storeId) await assertStoresInScope(db, scope, [input.storeId]);
  const fail = (message: string) => (acct.platform === "meta" ? new MetaAdsError(message, "config") : new GoogleAdsError(message, "config"));
  if (acct.isManager && input.syncEnabled) throw fail("Manager accounts have no spend of their own; map the accounts under it instead.");
  if (input.syncEnabled && !input.storeId) throw fail("Choose the store this account's spend belongs to before turning sync on.");
  const syncable = acct.platform === "meta" ? META_SYNCABLE_STATUSES.has(acct.accountStatus ?? "") : !acct.accountStatus || acct.accountStatus === "ENABLED";
  if (input.syncEnabled && !syncable) {
    throw fail(`This ${acct.platform === "meta" ? "Meta" : "Google Ads"} account is ${(acct.accountStatus ?? "unknown").toLowerCase().replace(/_/g, " ")} and cannot be synced.`);
  }
  const storeChanged = acct.storeId !== input.storeId;
  await db
    .update(schema.adAccount)
    .set({ storeId: input.storeId, syncEnabled: input.syncEnabled, ...(storeChanged ? { spendSyncedThrough: null, backfillCompletedAt: null } : {}), updatedAt: new Date() })
    .where(eq(schema.adAccount.id, accountId));
  await db.insert(schema.auditLog).values({
    organizationId: scope.organizationId,
    storeId: input.storeId,
    actorUserId: scope.userId,
    action: "ad_account.map",
    entityType: "ad_account",
    entityId: accountId,
    before: { storeId: acct.storeId, syncEnabled: acct.syncEnabled },
    after: input,
  });
  return { needsBackfill: input.syncEnabled && (storeChanged || !acct.backfillCompletedAt) };
}
