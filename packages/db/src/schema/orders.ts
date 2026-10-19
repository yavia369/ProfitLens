import { boolean, char, date, index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, rate, tsz, updatedAt } from "./_columns";
import { variant } from "./catalog";
import { store } from "./tenancy";

/** Minimal customer record (PII-minimised: no name, email, phone or address). */
export const customer = pgTable(
  "customer",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    countryCode: char("country_code", { length: 2 }),
    firstOrderAt: tsz("first_order_at"),
    firstOrderLocalDate: date("first_order_local_date", { mode: "string" }),
    ordersCount: integer("orders_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("customer_store_gid_uq").on(t.storeId, t.shopifyGid), index("customer_first_order_idx").on(t.storeId, t.firstOrderLocalDate)],
);

export const order = pgTable(
  "order",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    name: text("name").notNull(), // e.g. "#1029"
    customerId: uuid("customer_id").references(() => customer.id, { onDelete: "set null" }),
    createdAtShopify: tsz("created_at_shopify").notNull(),
    processedAt: tsz("processed_at").notNull(),
    /** processed_at in the store timezone; the "order date" used for cost lookups. */
    processedLocalDate: date("processed_local_date", { mode: "string" }).notNull(),
    cancelledAt: tsz("cancelled_at"),
    closedAt: tsz("closed_at"),
    test: boolean("test").notNull().default(false),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    currency: char("currency", { length: 3 }).notNull(), // shop currency
    presentmentCurrency: char("presentment_currency", { length: 3 }),
    sourceName: text("source_name"),
    salesChannel: text("sales_channel"),
    shippingCountryCode: char("shipping_country_code", { length: 2 }),
    landingSite: text("landing_site"),
    referringSite: text("referring_site"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    tags: text("tags").array(),
    // Shopify-reported snapshot totals (shop money) used for reconciliation only.
    subtotalPrice: money("subtotal_price"),
    totalDiscounts: money("total_discounts"),
    totalShippingPrice: money("total_shipping_price"),
    totalTax: money("total_tax"),
    totalTip: money("total_tip"),
    totalPrice: money("total_price"),
    totalRefunded: money("total_refunded"),
    currentTotalPrice: money("current_total_price"),
    taxesIncluded: boolean("taxes_included"),
    shopifyUpdatedAt: tsz("shopify_updated_at").notNull(),
    syncedAt: tsz("synced_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("order_store_gid_uq").on(t.storeId, t.shopifyGid),
    index("order_store_processed_date_idx").on(t.storeId, t.processedLocalDate),
    index("order_store_updated_idx").on(t.storeId, t.shopifyUpdatedAt),
    index("order_customer_idx").on(t.customerId),
    // Order search (`ilike '%…%'`); needs the pg_trgm extension (migration 0008).
    index("order_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const orderLineItem = pgTable(
  "order_line_item",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    variantId: uuid("variant_id").references(() => variant.id, { onDelete: "set null" }),
    variantGid: text("variant_gid"),
    productGid: text("product_gid"),
    title: text("title").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    quantity: integer("quantity").notNull(),
    currentQuantity: integer("current_quantity").notNull(),
    unfulfilledQuantity: integer("unfulfilled_quantity"),
    originalUnitPrice: money("original_unit_price").notNull(),
    isGiftCard: boolean("is_gift_card").notNull().default(false),
    requiresShipping: boolean("requires_shipping").notNull().default(true),
  },
  (t) => [
    unique("oli_store_gid_uq").on(t.storeId, t.shopifyGid),
    index("oli_order_idx").on(t.orderId),
    index("oli_variant_idx").on(t.variantId),
    index("oli_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("oli_sku_trgm_idx").using("gin", t.sku.op("gin_trgm_ops")),
  ],
);

export const saleActionType = pgEnum("sale_action_type", ["ORDER", "RETURN", "UPDATE", "UNKNOWN"]);
export const saleLineType = pgEnum("sale_line_type", [
  "PRODUCT",
  "SHIPPING",
  "TIP",
  "GIFT_CARD",
  "DUTY",
  "FEE",
  "ADDITIONAL_FEE",
  "ADJUSTMENT",
  "UNKNOWN",
]);

/**
 * One row per Shopify `Sale` inside a `SalesAgreement` (order placed / edited / refunded / returned).
 * This is the event-dated revenue ledger (see FINANCIAL_MODEL §3–4).
 */
export const saleLedgerEntry = pgTable(
  "sale_ledger_entry",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    saleGid: text("sale_gid").notNull(),
    agreementGid: text("agreement_gid").notNull(),
    agreementType: text("agreement_type").notNull(), // OrderAgreement | OrderEditAgreement | RefundAgreement | ReturnAgreement
    agreementReason: text("agreement_reason"),
    refundGid: text("refund_gid"),
    happenedAt: tsz("happened_at").notNull(),
    happenedLocalDate: date("happened_local_date", { mode: "string" }).notNull(),
    actionType: saleActionType("action_type").notNull(),
    lineType: saleLineType("line_type").notNull(),
    lineItemGid: text("line_item_gid"),
    quantity: integer("quantity"),
    totalAmount: money("total_amount").notNull(), // after taxes and discounts (shop money)
    totalDiscountBeforeTaxes: money("total_discount_before_taxes").notNull(),
    totalDiscountAfterTaxes: money("total_discount_after_taxes").notNull(),
    totalTaxAmount: money("total_tax_amount").notNull(),
  },
  (t) => [
    unique("sle_store_sale_gid_uq").on(t.storeId, t.saleGid),
    index("sle_store_date_idx").on(t.storeId, t.happenedLocalDate),
    index("sle_order_idx").on(t.orderId),
  ],
);

export const refund = pgTable(
  "refund",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    createdAtShopify: tsz("created_at_shopify").notNull(),
    totalRefunded: money("total_refunded"),
    note: text("note"),
  },
  (t) => [unique("refund_store_gid_uq").on(t.storeId, t.shopifyGid), index("refund_order_idx").on(t.orderId)],
);

export const restockType = pgEnum("restock_type", ["RETURN", "CANCEL", "NO_RESTOCK", "LEGACY_RESTOCK"]);

export const refundLineItem = pgTable(
  "refund_line_item",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    refundId: uuid("refund_id")
      .notNull()
      .references(() => refund.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    lineItemGid: text("line_item_gid").notNull(),
    quantity: integer("quantity").notNull(),
    restockType: restockType("restock_type").notNull(),
    restocked: boolean("restocked").notNull().default(false),
    subtotal: money("subtotal"),
    totalTax: money("total_tax"),
  },
  (t) => [unique("rli_store_gid_uq").on(t.storeId, t.shopifyGid), index("rli_refund_idx").on(t.refundId)],
);

export const feeStatus = pgEnum("fee_status", ["actual", "rule", "manual", "estimated", "missing"]);

export const paymentTransaction = pgTable(
  "payment_transaction",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    parentGid: text("parent_gid"),
    kind: text("kind").notNull(), // SALE | CAPTURE | AUTHORIZATION | REFUND | VOID | CHANGE | ...
    status: text("status").notNull(), // SUCCESS | FAILURE | PENDING | ERROR | ...
    gateway: text("gateway"),
    manualPaymentGateway: boolean("manual_payment_gateway").notNull().default(false),
    amount: money("amount").notNull(), // shop money
    currency: char("currency", { length: 3 }).notNull(),
    processedAt: tsz("processed_at"),
    processedLocalDate: date("processed_local_date", { mode: "string" }),
    /** Σ TransactionFee.amount (Shopify Payments only); null when Shopify reports no fee data. */
    feeAmount: money("fee_amount"),
    feeTaxAmount: money("fee_tax_amount"),
    feeRate: rate("fee_rate"),
    feeFlat: money("fee_flat"),
  },
  (t) => [unique("ptx_store_gid_uq").on(t.storeId, t.shopifyGid), index("ptx_order_idx").on(t.orderId)],
);

export const dispute = pgTable(
  "dispute",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => order.id, { onDelete: "set null" }),
    shopifyGid: text("shopify_gid").notNull(),
    type: text("type").notNull(), // CHARGEBACK | INQUIRY
    status: text("status").notNull(), // NEEDS_RESPONSE | UNDER_REVIEW | WON | LOST | ACCEPTED | ...
    reason: text("reason"),
    amount: money("amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    fee: money("fee"),
    initiatedAt: tsz("initiated_at"),
    finalizedOn: date("finalized_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("dispute_store_gid_uq").on(t.storeId, t.shopifyGid), index("dispute_order_idx").on(t.orderId)],
);

export const fulfillment = pgTable(
  "fulfillment",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    status: text("status").notNull(),
    createdAtShopify: tsz("created_at_shopify").notNull(),
    trackingCompany: text("tracking_company"),
  },
  (t) => [unique("fulfillment_store_gid_uq").on(t.storeId, t.shopifyGid), index("fulfillment_order_idx").on(t.orderId)],
);
