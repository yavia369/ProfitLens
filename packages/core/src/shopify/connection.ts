import { DEFAULT_POLICY, todayIn } from "@profitlens/finance";
import { assertRole, schema, type Database, type OrgScope } from "@profitlens/db";
import {
  AdminClient,
  mapShop,
  requestClientCredentialsToken,
  SHOP_DOMAIN_RE,
  SHOP_QUERY,
  ShopifyError,
  TokenProvider,
  type FetchLike,
  type RawShop,
} from "@profitlens/shopify";
import { and, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, type KeyRing } from "../security/crypto";

export const REQUIRED_SCOPES = [
  "read_orders",
  "read_products",
  "read_inventory",
  "read_customers",
  "read_returns",
  "read_shopify_payments_payouts",
  "read_shopify_payments_disputes",
] as const;
export const OPTIONAL_SCOPES = ["read_all_orders"] as const;

export interface ShopifyDeps {
  readonly db: Database;
  readonly keyring: KeyRing;
  readonly apiVersion: string;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
  readonly log?: (event: string, data: Record<string, unknown>) => void;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_input" | "auth_failed" | "missing_scopes" | "already_connected_elsewhere" | "not_found" | "forbidden",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

export interface ConnectResult {
  readonly storeId: string;
  readonly shopName: string;
  readonly grantedScopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly historyLimited: boolean;
}

const secretContext = (appId: string) => `shopify_app:${appId}`;
const tokenContext = (storeId: string) => `store_connection:${storeId}`;

/**
 * Connects a store using the client credentials grant (app created in the store's own Shopify
 * organization). Verifies credentials, scopes and shop identity before persisting anything.
 */
export async function connectStoreWithClientCredentials(
  deps: ShopifyDeps,
  scope: OrgScope,
  input: { shopDomain: string; clientId: string; clientSecret: string },
): Promise<ConnectResult> {
  assertRole(scope, "admin");
  const shopDomain = input.shopDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!SHOP_DOMAIN_RE.test(shopDomain)) throw new ConnectionError("Enter the store's myshopify.com domain, e.g. your-store.myshopify.com", "invalid_input");
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (clientId.length < 8 || clientSecret.length < 8) throw new ConnectionError("Client ID and secret are required", "invalid_input");

  let token;
  try {
    token = await requestClientCredentialsToken({ shopDomain, clientId, clientSecret }, deps.fetch);
  } catch (e) {
    throw new ConnectionError(e instanceof ShopifyError ? e.message : "Could not reach Shopify", "auth_failed", e instanceof ShopifyError ? e.details : undefined);
  }
  const missingScopes = REQUIRED_SCOPES.filter((s) => !token.scopes.includes(s));
  if (missingScopes.length) {
    throw new ConnectionError(`The app is missing required scopes: ${missingScopes.join(", ")}. Add them in the app's version, release it, and approve the update in Shopify admin.`, "missing_scopes", missingScopes);
  }
  const client = new AdminClient({ shopDomain, apiVersion: deps.apiVersion, getAccessToken: async () => token.token, ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}) });
  const { data } = await client.request<{ shop: RawShop }>(SHOP_QUERY, {}, 5);
  const shop = mapShop(data.shop);
  if (shop.shopDomain !== shopDomain) throw new ConnectionError(`Credentials belong to ${shop.shopDomain}, not ${shopDomain}`, "auth_failed");

  const { db, keyring } = deps;
  const storeId = await db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.store).where(eq(schema.store.shopDomain, shopDomain)).limit(1);
    if (existing[0] && existing[0].organizationId !== scope.organizationId) {
      throw new ConnectionError("This store is already connected to another ProfitLens workspace", "already_connected_elsewhere");
    }
    const storeValues = {
      organizationId: scope.organizationId,
      shopDomain,
      shopGid: shop.shopGid,
      name: shop.name,
      currency: shop.currency,
      ianaTimezone: shop.ianaTimezone,
      shopifyPlan: shop.plan,
      thirdPartyFeeRate: shop.thirdPartyFeeRate,
      status: "active" as const,
      installedAt: new Date(),
      uninstalledAt: null,
    };
    const [st] = existing[0]
      ? await tx.update(schema.store).set(storeValues).where(eq(schema.store.id, existing[0].id)).returning({ id: schema.store.id })
      : await tx.insert(schema.store).values(storeValues).returning({ id: schema.store.id });
    const sid = st!.id;

    const [appRow] = await tx
      .insert(schema.shopifyApp)
      .values({ organizationId: scope.organizationId, label: `${shop.name} (custom app)`, clientId, clientSecretEnc: "pending", distribution: "custom", scopes: token.scopes.join(",") })
      .onConflictDoUpdate({ target: schema.shopifyApp.clientId, set: { scopes: token.scopes.join(","), updatedAt: new Date() } })
      .returning({ id: schema.shopifyApp.id, organizationId: schema.shopifyApp.organizationId });
    if (appRow!.organizationId !== scope.organizationId) throw new ConnectionError("These app credentials are registered to another workspace", "already_connected_elsewhere");
    await tx.update(schema.shopifyApp).set({ clientSecretEnc: encryptSecret(keyring, clientSecret, secretContext(appRow!.id)) }).where(eq(schema.shopifyApp.id, appRow!.id));

    const connValues = {
      storeId: sid,
      shopifyAppId: appRow!.id,
      accessTokenEnc: encryptSecret(keyring, token.token, tokenContext(sid)),
      accessTokenExpiresAt: token.expiresAt,
      grantedScopes: token.scopes.join(","),
      status: "active" as const,
      lastError: null,
      authMode: "client_credentials",
    };
    await tx.insert(schema.storeConnection).values(connValues).onConflictDoUpdate({ target: schema.storeConnection.storeId, set: connValues });

    const hasPolicy = await tx.select({ id: schema.financialPolicy.id }).from(schema.financialPolicy).where(eq(schema.financialPolicy.storeId, sid)).limit(1);
    if (!hasPolicy.length) {
      await tx.insert(schema.financialPolicy).values({ storeId: sid, version: 1, settings: DEFAULT_POLICY as unknown as Record<string, unknown>, createdByUserId: scope.userId });
    }
    await tx.insert(schema.auditLog).values({
      organizationId: scope.organizationId,
      storeId: sid,
      actorUserId: scope.userId,
      action: "store.connect",
      entityType: "store",
      entityId: sid,
      after: { shopDomain, scopes: token.scopes, authMode: "client_credentials", connectedOn: todayIn(shop.ianaTimezone) },
    });
    return sid;
  });

  return {
    storeId,
    shopName: shop.name,
    grantedScopes: token.scopes,
    missingScopes: [],
    historyLimited: !token.scopes.includes("read_all_orders"),
  };
}

export interface StoreClient {
  readonly client: AdminClient;
  readonly store: typeof schema.store.$inferSelect;
  readonly connection: typeof schema.storeConnection.$inferSelect;
  readonly scopes: readonly string[];
}

/** Builds an authenticated Admin API client for a connected store (token reused while valid, refreshed when needed). */
export async function clientForStore(deps: ShopifyDeps, storeId: string): Promise<StoreClient> {
  const rows = await deps.db
    .select({ store: schema.store, connection: schema.storeConnection, app: schema.shopifyApp })
    .from(schema.storeConnection)
    .innerJoin(schema.store, eq(schema.store.id, schema.storeConnection.storeId))
    .innerJoin(schema.shopifyApp, eq(schema.shopifyApp.id, schema.storeConnection.shopifyAppId))
    .where(and(eq(schema.storeConnection.storeId, storeId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ConnectionError("Store is not connected", "not_found");
  if (row.connection.status === "revoked") throw new ConnectionError("Store connection was revoked (app uninstalled)", "auth_failed");
  const { keyring, db } = deps;
  const clientSecret = decryptSecret(keyring, row.app.clientSecretEnc, secretContext(row.app.id));
  const cachedValid = row.connection.accessTokenExpiresAt && row.connection.accessTokenExpiresAt.getTime() - Date.now() > 5 * 60_000;
  let initial = cachedValid
    ? { token: decryptSecret(keyring, row.connection.accessTokenEnc, tokenContext(storeId)), scopes: row.connection.grantedScopes.split(","), expiresAt: row.connection.accessTokenExpiresAt }
    : null;
  const provider = new TokenProvider(
    async () => {
      if (initial) {
        const t = initial;
        initial = null;
        return t;
      }
      return requestClientCredentialsToken({ shopDomain: row.store.shopDomain, clientId: row.app.clientId, clientSecret }, deps.fetch);
    },
    async (t) => {
      await db
        .update(schema.storeConnection)
        .set({ accessTokenEnc: encryptSecret(keyring, t.token, tokenContext(storeId)), accessTokenExpiresAt: t.expiresAt, grantedScopes: t.scopes.join(","), status: "active", lastError: null })
        .where(eq(schema.storeConnection.storeId, storeId));
    },
  );
  const client = new AdminClient({
    shopDomain: row.store.shopDomain,
    apiVersion: deps.apiVersion,
    getAccessToken: () => provider.get(),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.log ? { log: deps.log } : {}),
  });
  return { client, store: row.store, connection: row.connection, scopes: row.connection.grantedScopes.split(",") };
}
