import { boolean, char, index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, rate, tsz, updatedAt } from "./_columns";
import { user } from "./auth";

export const memberRole = pgEnum("member_role", ["owner", "admin", "editor", "viewer"]);

export const organization = pgTable("organization", {
  id: id(),
  name: text("name").notNull(),
  /** ISO 4217 code used for consolidated multi-store reports. */
  reportingCurrency: char("reporting_currency", { length: 3 }).notNull().default("USD"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const membership = pgTable(
  "membership",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("membership_org_user_uq").on(t.organizationId, t.userId), index("membership_user_idx").on(t.userId)],
);

export const storeStatus = pgEnum("store_status", ["pending", "active", "disconnected", "uninstalled"]);

export const store = pgTable(
  "store",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("shopify"),
    /** e.g. example.myshopify.com — unique across the system (one store, one organization). */
    shopDomain: text("shop_domain").notNull().unique(),
    shopGid: text("shop_gid"),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    ianaTimezone: text("iana_timezone").notNull(),
    shopifyPlan: text("shopify_plan"),
    hasShopifyPayments: boolean("has_shopify_payments"),
    /** Shopify fee on third-party gateways for the store's plan, in percent (e.g. 2.0). */
    thirdPartyFeeRate: rate("third_party_fee_rate"),
    status: storeStatus("status").notNull().default("pending"),
    /** Demo stores hold seeded sample data and are always shown with a demo banner. */
    isDemo: boolean("is_demo").notNull().default(false),
    installedAt: tsz("installed_at"),
    uninstalledAt: tsz("uninstalled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("store_org_idx").on(t.organizationId)],
);
