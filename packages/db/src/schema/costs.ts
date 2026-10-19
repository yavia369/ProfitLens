import { boolean, char, date, index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, money, rate, tsz, updatedAt } from "./_columns";
import { order } from "./orders";
import { organization, store } from "./tenancy";

export const shippingRuleType = pgEnum("shipping_rule_type", ["per_order", "per_item", "first_plus_additional", "tiered_quantity", "tiered_weight"]);

/** Merchant-paid shipping cost rules, effective-dated in store-local dates. */
export const shippingRule = pgTable(
  "shipping_rule",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: shippingRuleType("type").notNull(),
    /** Destination countries (ISO alpha-2); null = all countries. */
    countryCodes: text("country_codes").array(),
    /** Lower number wins when several rules match an order. */
    priority: integer("priority").notNull().default(100),
    /** Type-specific parameters, validated by zod in core (amounts are decimal strings). */
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shipping_rule_store_idx").on(t.storeId, t.effectiveFrom)],
);

export const handlingRule = pgTable(
  "handling_rule",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(), // per_order | per_item
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [index("handling_rule_store_idx").on(t.storeId, t.effectiveFrom)],
);

/** Fee rule per payment gateway (used when Shopify does not report actual fees). */
export const gatewayFeeRule = pgTable(
  "gateway_fee_rule",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    gateway: text("gateway").notNull(),
    percentRate: rate("percent_rate").notNull(), // 2.9 = 2.9 %
    fixedFee: money("fixed_fee").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    /** Whether Shopify's third-party transaction fee applies on top (non-Shopify-Payments gateways). */
    thirdPartyFeeApplies: boolean("third_party_fee_applies").notNull().default(true),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [index("gateway_fee_rule_store_idx").on(t.storeId, t.gateway, t.effectiveFrom)],
);

export const costComponent = pgEnum("cost_component", ["cogs", "shipping", "handling", "transaction_fees"]);

/**
 * Manual per-order cost value. Overrides never overwrite synced data; they are separate,
 * audited rows that take priority in the calculation (latest active row per component wins).
 */
export const orderCostOverride = pgTable(
  "order_cost_override",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    component: costComponent("component").notNull(),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    reason: text("reason"),
    source: text("source").notNull().default("manual"), // manual | csv_import | carrier_sync
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    supersededAt: tsz("superseded_at"),
    createdAt: createdAt(),
  },
  (t) => [index("order_cost_override_order_idx").on(t.orderId, t.component)],
);

export const expenseCategory = pgTable(
  "expense_category",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isMarketing: boolean("is_marketing").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique("expense_category_org_name_uq").on(t.organizationId, t.name)],
);

export const expenseType = pgEnum("expense_type", [
  "one_time",
  "recurring",
  "per_order",
  "percent_of_revenue",
  "percent_of_net_sales",
  "percent_of_ad_spend",
]);
export const expenseFrequency = pgEnum("expense_frequency", ["daily", "weekly", "monthly"]);
export const expenseAllocation = pgEnum("expense_allocation", ["spread", "on_date"]);

export const expense = pgTable(
  "expense",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** null = organization-level expense split across active stores (M2). */
    storeId: uuid("store_id").references(() => store.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => expenseCategory.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: expenseType("type").notNull(),
    frequency: expenseFrequency("frequency"),
    allocation: expenseAllocation("allocation").notNull().default("spread"),
    /** Money amount for one_time / recurring / per_order. */
    amount: money("amount"),
    /** Percent for percent_of_* types (5 = 5 %). */
    percent: rate("percent"),
    currency: char("currency", { length: 3 }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isAdSpend: boolean("is_ad_spend").notNull().default(false),
    note: text("note"),
    archivedAt: tsz("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expense_store_idx").on(t.storeId, t.startDate), index("expense_org_idx").on(t.organizationId)],
);

/** Versioned calculation policy per store (FINANCIAL_MODEL §7). The newest version is active. */
export const financialPolicy = pgTable(
  "financial_policy",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique("financial_policy_store_version_uq").on(t.storeId, t.version)],
);
