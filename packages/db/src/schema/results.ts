import { boolean, char, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { variant } from "./catalog";
import { createdAt, id, money, tsz } from "./_columns";
import { order } from "./orders";
import { store } from "./tenancy";

export const fxRate = pgTable(
  "fx_rate",
  {
    date: date("date", { mode: "string" }).notNull(),
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    /** 1 base = rate quote. */
    rate: numeric("rate", { precision: 24, scale: 12 }).notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ name: "fx_rate_pk", columns: [t.date, t.base, t.quote] })],
);

/** Lifetime profit result per order, with the full calculation trace (FINANCIAL_MODEL §8). */
export const orderProfit = pgTable("order_profit", {
  orderId: uuid("order_id")
    .primaryKey()
    .references(() => order.id, { onDelete: "cascade" }),
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id, { onDelete: "cascade" }),
  revenue: money("revenue").notNull(),
  cogs: money("cogs").notNull(),
  shippingCost: money("shipping_cost").notNull(),
  handlingCost: money("handling_cost").notNull(),
  transactionFees: money("transaction_fees").notNull(),
  chargebacks: money("chargebacks").notNull().default("0"),
  contributionBeforeAds: money("contribution_before_ads").notNull(),
  profit: money("profit").notNull(),
  isComplete: boolean("is_complete").notNull(),
  /** false for test orders and financial statuses the policy excludes (they contribute nothing). */
  included: boolean("included").notNull().default(true),
  exclusionReason: text("exclusion_reason"),
  missingComponents: text("missing_components").array().notNull(),
  estimatedComponents: text("estimated_components").array().notNull(),
  trace: jsonb("trace").$type<Record<string, unknown>>().notNull(),
  engineVersion: text("engine_version").notNull(),
  policyVersion: integer("policy_version").notNull(),
  inputsHash: text("inputs_hash").notNull(),
  computedAt: tsz("computed_at").notNull().defaultNow(),
});

/**
 * One order's contribution to one store-local day (FINANCIAL_MODEL §8: Σ days of an order = its lifetime result).
 * Rewritten whenever the order is recalculated; `daily_store_metrics` is the per-day sum of these rows.
 */
export const orderDailyResult = pgTable(
  "order_daily_result",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    unitsSold: integer("units_sold").notNull().default(0),
    grossSales: money("gross_sales").notNull().default("0"),
    discounts: money("discounts").notNull().default("0"),
    returns: money("returns").notNull().default("0"),
    shippingCharged: money("shipping_charged").notNull().default("0"),
    tips: money("tips").notNull().default("0"),
    adjustments: money("adjustments").notNull().default("0"),
    dutiesAndFees: money("duties_and_fees").notNull().default("0"),
    taxes: money("taxes").notNull().default("0"),
    giftCardSales: money("gift_card_sales").notNull().default("0"),
    revenue: money("revenue").notNull().default("0"),
    cogs: money("cogs").notNull().default("0"),
    shippingCost: money("shipping_cost").notNull().default("0"),
    handlingCost: money("handling_cost").notNull().default("0"),
    transactionFees: money("transaction_fees").notNull().default("0"),
    chargebackLoss: money("chargeback_loss").notNull().default("0"),
    chargebackFees: money("chargeback_fees").notNull().default("0"),
    ordersMissingCogs: integer("orders_missing_cogs").notNull().default(0),
    revenueMissingCogs: money("revenue_missing_cogs").notNull().default("0"),
    ordersMissingShipping: integer("orders_missing_shipping").notNull().default(0),
    feesEstimatedAmount: money("fees_estimated_amount").notNull().default("0"),
    transactionsMissingFees: integer("transactions_missing_fees").notNull().default(0),
    unclassifiedSalesAmount: money("unclassified_sales_amount").notNull().default("0"),
  },
  (t) => [unique("odr_order_date_uq").on(t.orderId, t.localDate), index("odr_store_date_idx").on(t.storeId, t.localDate)],
);

/** COGS booked per order line and day (sales positive, reversals negative). Feeds the product report. */
export const orderCogsLine = pgTable(
  "order_cogs_line",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    lineItemGid: text("line_item_gid"),
    variantId: uuid("variant_id").references(() => variant.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // sale | reversal | override
    quantity: integer("quantity").notNull(),
    unitCost: money("unit_cost"),
    amount: money("amount").notNull(),
    status: text("status").notNull(), // actual | rule | manual | estimated | missing
    /** Cost version used (not a foreign key: versions can be replaced while results keep their history). */
    costVersionId: uuid("cost_version_id"),
  },
  (t) => [index("ocl_store_date_idx").on(t.storeId, t.localDate), index("ocl_order_idx").on(t.orderId), index("ocl_variant_idx").on(t.variantId)],
);

/**
 * Additive daily components per store and local date (FINANCIAL_MODEL §9).
 * Ratios are never stored; they are derived from summed components on read.
 */
export const dailyStoreMetrics = pgTable(
  "daily_store_metrics",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    unitsSold: integer("units_sold").notNull().default(0),
    newCustomers: integer("new_customers").notNull().default(0),
    grossSales: money("gross_sales").notNull().default("0"),
    discounts: money("discounts").notNull().default("0"),
    returns: money("returns").notNull().default("0"),
    shippingCharged: money("shipping_charged").notNull().default("0"),
    tips: money("tips").notNull().default("0"),
    adjustments: money("adjustments").notNull().default("0"),
    dutiesAndFees: money("duties_and_fees").notNull().default("0"),
    taxes: money("taxes").notNull().default("0"),
    giftCardSales: money("gift_card_sales").notNull().default("0"),
    revenue: money("revenue").notNull().default("0"),
    cogs: money("cogs").notNull().default("0"),
    shippingCost: money("shipping_cost").notNull().default("0"),
    handlingCost: money("handling_cost").notNull().default("0"),
    transactionFees: money("transaction_fees").notNull().default("0"),
    chargebackLoss: money("chargeback_loss").notNull().default("0"),
    chargebackFees: money("chargeback_fees").notNull().default("0"),
    adSpend: money("ad_spend").notNull().default("0"),
    variableExpenses: money("variable_expenses").notNull().default("0"),
    adLinkedExpenses: money("ad_linked_expenses").notNull().default("0"),
    fixedExpenses: money("fixed_expenses").notNull().default("0"),
    marketingExpenses: money("marketing_expenses").notNull().default("0"),
    // Completeness counters.
    ordersMissingCogs: integer("orders_missing_cogs").notNull().default(0),
    revenueMissingCogs: money("revenue_missing_cogs").notNull().default("0"),
    ordersMissingShipping: integer("orders_missing_shipping").notNull().default(0),
    feesEstimatedAmount: money("fees_estimated_amount").notNull().default("0"),
    transactionsMissingFees: integer("transactions_missing_fees").notNull().default(0),
    fxIssues: integer("fx_issues").notNull().default(0),
    unclassifiedSalesAmount: money("unclassified_sales_amount").notNull().default("0"),
    computedAt: tsz("computed_at").notNull().defaultNow(),
  },
  (t) => [unique("daily_store_metrics_store_date_uq").on(t.storeId, t.localDate)],
);
