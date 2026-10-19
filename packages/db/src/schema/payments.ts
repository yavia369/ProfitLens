import { index, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, tsz, updatedAt } from "./_columns";
import { connectionStatus } from "./connections";
import { organization, store } from "./tenancy";

export const paymentGateway = pgEnum("payment_gateway", ["stripe", "paypal"]);
export const gatewayMatchStatus = pgEnum("gateway_match_status", ["matched", "unmatched", "ambiguous"]);

/** Read-only access to a payment processor account, mapped to one store (D-052). Credentials encrypted. */
export const paymentConnection = pgTable(
  "payment_connection",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    gateway: paymentGateway("gateway").notNull(),
    displayName: text("display_name").notNull(),
    credentialsEnc: text("credentials_enc").notNull(),
    status: connectionStatus("status").notNull().default("active"),
    lastError: text("last_error"),
    /** Gateway records are imported up to this instant (re-read with an overlap on every sync). */
    syncedThrough: tsz("synced_through"),
    lastSyncedAt: tsz("last_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("payment_connection_store_gateway_uq").on(t.storeId, t.gateway)],
);

/** One processor payment and how it matched a Shopify payment (amount + currency + time, D-052). */
export const gatewayTransaction = pgTable(
  "gateway_transaction",
  {
    id: id(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => paymentConnection.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    occurredAt: tsz("occurred_at").notNull(),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    fee: money("fee").notNull(),
    feeCurrency: text("fee_currency").notNull(),
    matchStatus: gatewayMatchStatus("match_status").notNull(),
    matchReason: text("match_reason"),
    /**
     * GID of the Shopify payment this record's fee applies to. A GID, not a row id: order syncs replace
     * transaction rows, while GIDs are stable. One gateway record per Shopify payment.
     */
    shopifyTransactionGid: text("shopify_transaction_gid"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("gateway_txn_conn_ext_uq").on(t.connectionId, t.externalId),
    unique("gateway_txn_store_shopify_uq").on(t.storeId, t.shopifyTransactionGid),
    index("gateway_txn_store_time_idx").on(t.storeId, t.occurredAt),
  ],
);
