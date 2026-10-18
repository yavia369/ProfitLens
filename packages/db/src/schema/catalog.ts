import { boolean, char, date, index, integer, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { createdAt, id, money, tsz, updatedAt } from "./_columns.js";
import { store } from "./tenancy.js";

export const product = pgTable(
  "product",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    title: text("title").notNull(),
    status: text("status"), // ACTIVE | DRAFT | ARCHIVED | UNLISTED
    productType: text("product_type"),
    vendor: text("vendor"),
    shopifyUpdatedAt: tsz("shopify_updated_at"),
    deletedAt: tsz("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("product_store_gid_uq").on(t.storeId, t.shopifyGid)],
);

export const variant = pgTable(
  "variant",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    shopifyGid: text("shopify_gid").notNull(),
    inventoryItemGid: text("inventory_item_gid"),
    title: text("title").notNull(),
    sku: text("sku"),
    price: money("price"),
    /** Last unitCost seen on the Shopify InventoryItem (current value only; history lives in cost versions). */
    shopifyUnitCost: money("shopify_unit_cost"),
    weightGrams: integer("weight_grams"),
    requiresShipping: boolean("requires_shipping"),
    shopifyUpdatedAt: tsz("shopify_updated_at"),
    deletedAt: tsz("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("variant_store_gid_uq").on(t.storeId, t.shopifyGid),
    index("variant_product_idx").on(t.productId),
    index("variant_sku_idx").on(t.storeId, t.sku),
  ],
);

export const costSource = pgEnum("cost_source", ["shopify_sync", "manual", "csv_import", "supplier", "bulk_edit"]);

/**
 * Effective-dated landed unit cost of a variant, in store-local dates.
 * Interval is [effective_from, effective_to); effective_to null = open-ended.
 * Overlaps per variant are prevented by an exclusion constraint (see custom migration).
 */
export const variantCostVersion = pgTable(
  "variant_cost_version",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variant.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    currency: char("currency", { length: 3 }).notNull(),
    productCost: money("product_cost").notNull(),
    inboundShipping: money("inbound_shipping").notNull().default("0"),
    handling: money("handling").notNull().default("0"),
    source: costSource("source").notNull(),
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("vcv_variant_from_idx").on(t.variantId, t.effectiveFrom)],
);
