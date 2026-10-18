import { date, index, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, tsz } from "./_columns.js";
import { organization, store } from "./tenancy.js";

export const syncJobStatus = pgEnum("sync_job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);

/** User-visible record of each sync/recalculation job (Sync Center). Queue internals live in pg-boss. */
export const syncJob = pgTable(
  "sync_job",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => store.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // shopify.backfill | shopify.incremental | ads.google.sync | recalc.store | ...
    status: syncJobStatus("status").notNull().default("queued"),
    /** Resumable checkpoint (e.g. backfill window / bulk operation id). */
    cursor: jsonb("cursor").$type<Record<string, unknown>>(),
    progress: jsonb("progress").$type<{ done: number; total: number | null; unit: string }>(),
    stats: jsonb("stats").$type<Record<string, number>>(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    queuedAt: createdAt(),
    startedAt: tsz("started_at"),
    finishedAt: tsz("finished_at"),
  },
  (t) => [index("sync_job_store_kind_idx").on(t.storeId, t.kind, t.queuedAt)],
);

/** Webhook receipts for idempotency. Payloads are not stored (hash only). */
export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: id(),
    storeId: uuid("store_id").references(() => store.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("shopify"),
    /** X-Shopify-Webhook-Id (unique per delivery attempt chain). */
    externalId: text("external_id").notNull(),
    topic: text("topic").notNull(),
    shopDomain: text("shop_domain"),
    payloadSha256: text("payload_sha256").notNull(),
    resourceGid: text("resource_gid"),
    receivedAt: tsz("received_at").notNull().defaultNow(),
    processedAt: tsz("processed_at"),
    status: text("status").notNull().default("received"), // received | enqueued | processed | ignored | failed
  },
  (t) => [unique("webhook_event_provider_ext_uq").on(t.provider, t.externalId), index("webhook_event_store_idx").on(t.storeId, t.receivedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => store.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id"), // null = system
    action: text("action").notNull(), // e.g. cost_version.create, policy.update, expense.delete
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: createdAt(),
  },
  (t) => [index("audit_log_org_at_idx").on(t.organizationId, t.at)],
);

export const reconciliationIssue = pgTable(
  "reconciliation_issue",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    metric: text("metric").notNull(), // orders_count | gross_sales | discounts | returns | shipping | taxes | ad_spend
    expected: money("expected").notNull(),
    actual: money("actual").notNull(),
    difference: money("difference").notNull(),
    detectedAt: tsz("detected_at").notNull().defaultNow(),
    resolvedAt: tsz("resolved_at"),
    resolution: text("resolution"),
  },
  (t) => [index("reconciliation_issue_store_date_idx").on(t.storeId, t.localDate)],
);
