import { date, index, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, tsz, updatedAt } from "./_columns";
import { organization, store } from "./tenancy";

/**
 * Shopify app credentials. Several rows are allowed so each owned non-Plus store can use its own
 * custom-distribution app, while a future public app is a single shared row.
 */
export const shopifyApp = pgTable("shopify_app", {
  id: id(),
  /** null = platform-wide app (public distribution); otherwise owned by one organization. */
  organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  distribution: text("distribution").notNull(), // "custom" | "public"
  scopes: text("scopes").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const connectionStatus = pgEnum("connection_status", ["active", "needs_reauth", "revoked", "error"]);

export const storeConnection = pgTable("store_connection", {
  id: id(),
  storeId: uuid("store_id")
    .notNull()
    .unique()
    .references(() => store.id, { onDelete: "cascade" }),
  shopifyAppId: uuid("shopify_app_id")
    .notNull()
    .references(() => shopifyApp.id),
  accessTokenEnc: text("access_token_enc").notNull(),
  accessTokenExpiresAt: tsz("access_token_expires_at"),
  refreshTokenEnc: text("refresh_token_enc"),
  refreshTokenExpiresAt: tsz("refresh_token_expires_at"),
  grantedScopes: text("granted_scopes").notNull(),
  status: connectionStatus("status").notNull().default("active"),
  lastError: text("last_error"),
  /** Auth mode: client_credentials (store in the app's own org) or authorization_code (OAuth install). */
  authMode: text("auth_mode").notNull().default("client_credentials"),
  // Sync checkpoints (high-water marks of Shopify updated_at, minus an overlap window when used).
  ordersSyncedThrough: tsz("orders_synced_through"),
  productsSyncedThrough: tsz("products_synced_through"),
  disputesSyncedAt: tsz("disputes_synced_at"),
  backfillStartedAt: tsz("backfill_started_at"),
  backfillCompletedAt: tsz("backfill_completed_at"),
  /** Earliest order date imported; later than store creation when history is limited (no read_all_orders). */
  historyStart: date("history_start", { mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Single-use OAuth state (Shopify + Google). Only the SHA-256 of the state value is stored. */
export const oauthState = pgTable(
  "oauth_state",
  {
    id: id(),
    stateHash: text("state_hash").notNull().unique(),
    provider: text("provider").notNull(), // "shopify" | "google_ads"
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** PKCE verifier (encrypted) for providers that use it. */
    codeVerifierEnc: text("code_verifier_enc"),
    context: jsonb("context").$type<Record<string, string>>().notNull().default({}),
    expiresAt: tsz("expires_at").notNull(),
    consumedAt: tsz("consumed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_state_expires_idx").on(t.expiresAt)],
);

export const adPlatform = pgEnum("ad_platform", ["google_ads", "meta", "tiktok", "manual"]);

export const adConnection = pgTable(
  "ad_connection",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: adPlatform("platform").notNull(),
    /** Provider user identity (e.g. Google account subject) used to dedupe reconnects. */
    externalUserId: text("external_user_id"),
    displayName: text("display_name"),
    /** service_account (owner's own accounts, D-041) or oauth (merchant sign-in, later). */
    authType: text("auth_type").notNull().default("oauth"),
    /** Service account key JSON, AES-256-GCM encrypted (auth_type = service_account). */
    credentialsEnc: text("credentials_enc"),
    /** Manager account used as login-customer-id for all calls, when access goes through one. */
    loginCustomerId: text("login_customer_id"),
    refreshTokenEnc: text("refresh_token_enc"),
    accessTokenEnc: text("access_token_enc"),
    accessTokenExpiresAt: tsz("access_token_expires_at"),
    scopes: text("scopes"),
    status: connectionStatus("status").notNull().default("active"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("ad_connection_org_platform_user_uq").on(t.organizationId, t.platform, t.externalUserId)],
);
