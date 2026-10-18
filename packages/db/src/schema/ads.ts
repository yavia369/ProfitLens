import { bigint, boolean, char, date, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { createdAt, id, money, updatedAt } from "./_columns.js";
import { adConnection, adPlatform } from "./connections.js";
import { organization, store } from "./tenancy.js";

export const adAccount = pgTable(
  "ad_account",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** null for manual-entry pseudo accounts. */
    connectionId: uuid("connection_id").references(() => adConnection.id, { onDelete: "set null" }),
    platform: adPlatform("platform").notNull(),
    externalId: text("external_id").notNull(), // Google customer id (digits), Meta act_..., "manual:<uuid>"
    /** Manager account used as login-customer-id when access is via an MCC. */
    loginCustomerId: text("login_customer_id"),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    timezone: text("timezone").notNull(),
    isManager: boolean("is_manager").notNull().default(false),
    /** The store this account's spend is attributed to (one account → one store in M1). */
    storeId: uuid("store_id").references(() => store.id, { onDelete: "set null" }),
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("ad_account_org_platform_ext_uq").on(t.organizationId, t.platform, t.externalId), index("ad_account_store_idx").on(t.storeId)],
);

export const adCampaign = pgTable(
  "ad_campaign",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccount.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    status: text("status"),
    channelType: text("channel_type"), // SEARCH | SHOPPING | PERFORMANCE_MAX | ...
    updatedAt: updatedAt(),
  },
  (t) => [unique("ad_campaign_account_ext_uq").on(t.adAccountId, t.externalId)],
);

export const adGroup = pgTable(
  "ad_group",
  {
    id: id(),
    adCampaignId: uuid("ad_campaign_id")
      .notNull()
      .references(() => adCampaign.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    status: text("status"),
    updatedAt: updatedAt(),
  },
  (t) => [unique("ad_group_campaign_ext_uq").on(t.adCampaignId, t.externalId)],
);

export const adSpendLevel = pgEnum("ad_spend_level", ["account", "campaign", "ad_group"]);
export const adSpendSource = pgEnum("ad_spend_source", ["api", "manual"]);

/**
 * Daily advertising metrics in the ad account's currency and timezone.
 * Store-level totals use level = 'campaign' rows (or 'account' rows for platforms/manual entries
 * without campaigns) — never both, to avoid double counting.
 */
export const adSpendDaily = pgTable(
  "ad_spend_daily",
  {
    id: id(),
    adAccountId: uuid("ad_account_id")
      .notNull()
      .references(() => adAccount.id, { onDelete: "cascade" }),
    level: adSpendLevel("level").notNull(),
    /** External id of the campaign / ad group; the account id for account level. */
    entityExternalId: text("entity_external_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    source: adSpendSource("source").notNull(),
    spend: money("spend").notNull(),
    impressions: bigint("impressions", { mode: "bigint" }),
    clicks: bigint("clicks", { mode: "bigint" }),
    /** Platform-reported conversions (decimal, Google reports fractional conversions). */
    conversions: money("conversions"),
    /** Platform-reported conversion value — label as "platform-reported" in UI. */
    conversionValue: money("conversion_value"),
    note: text("note"),
    enteredByUserId: text("entered_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ad_spend_daily_uq").on(t.adAccountId, t.level, t.entityExternalId, t.date, t.source),
    index("ad_spend_daily_account_date_idx").on(t.adAccountId, t.date),
  ],
);
