import { schema, type Database } from "@profitlens/db";
import { parseWebhookHeaders, verifyWebhookHmac } from "@profitlens/shopify";
import { and, eq } from "drizzle-orm";
import { enqueueIncremental, enqueueOrderRefresh, type JobSender } from "../jobs/queues";
import { decryptSecret, sha256Hex, type KeyRing } from "../security/crypto";

export interface WebhookDeps {
  readonly db: Database;
  readonly keyring: KeyRing;
  readonly jobs: JobSender;
}

export type WebhookOutcome =
  | "invalid_headers"
  | "unknown_shop"
  | "invalid_signature"
  | "duplicate"
  | "enqueued_order"
  | "enqueued_sync"
  | "uninstalled"
  | "redacted_shop"
  | "redacted_customers"
  | "data_request_logged"
  | "ignored_topic";

export interface WebhookResult {
  /** HTTP status to return to Shopify (2xx acknowledges; 401 for bad signatures). */
  readonly status: 200 | 401 | 400;
  readonly outcome: WebhookOutcome;
}

const ORDER_TOPICS = new Set(["orders/create", "orders/updated", "orders/edited", "orders/cancelled", "orders/paid", "orders/fulfilled", "orders/partially_fulfilled", "refunds/create", "order_transactions/create"]);
const SYNC_TOPICS = new Set(["products/create", "products/update", "products/delete", "inventory_items/update", "disputes/create", "disputes/update"]);

function orderGidFrom(topic: string, payload: Record<string, unknown>): string | null {
  if (topic.startsWith("orders/") && typeof payload.admin_graphql_api_id === "string") return payload.admin_graphql_api_id;
  const id = payload.order_id ?? (topic.startsWith("orders/") ? payload.id : undefined);
  return typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id)) ? `gid://shopify/Order/${id}` : null;
}

/**
 * Verifies, de-duplicates and routes one Shopify webhook delivery. Payloads are treated as hints only:
 * order topics enqueue a re-fetch of the authoritative order (deliveries can be stale or out of order).
 */
export async function handleShopifyWebhook(deps: WebhookDeps, rawBody: Buffer, getHeader: (name: string) => string | null): Promise<WebhookResult> {
  const headers = parseWebhookHeaders(getHeader);
  if (!headers) return { status: 400, outcome: "invalid_headers" };

  const rows = await deps.db
    .select({ store: schema.store, app: schema.shopifyApp })
    .from(schema.store)
    .innerJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id))
    .innerJoin(schema.shopifyApp, eq(schema.shopifyApp.id, schema.storeConnection.shopifyAppId))
    .where(eq(schema.store.shopDomain, headers.shopDomain))
    .limit(1);
  const row = rows[0];
  // Unknown shops are acknowledged (nothing to do) but nothing is processed or stored.
  if (!row) return { status: 200, outcome: "unknown_shop" };
  const secret = decryptSecret(deps.keyring, row.app.clientSecretEnc, `shopify_app:${row.app.id}`);
  if (!verifyWebhookHmac(rawBody, getHeader("x-shopify-hmac-sha256"), secret)) return { status: 401, outcome: "invalid_signature" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { status: 400, outcome: "invalid_headers" };
  }
  const storeId = row.store.id;
  const orderGid = orderGidFrom(headers.topic, payload);
  const inserted = await deps.db
    .insert(schema.webhookEvent)
    .values({ storeId, provider: "shopify", externalId: headers.webhookId, topic: headers.topic, shopDomain: headers.shopDomain, payloadSha256: sha256Hex(rawBody), resourceGid: orderGid })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvent.id });
  if (!inserted.length) return { status: 200, outcome: "duplicate" };
  const eventId = inserted[0]!.id;
  const finish = async (outcome: WebhookOutcome, status: "enqueued" | "processed" | "ignored") => {
    await deps.db.update(schema.webhookEvent).set({ status, processedAt: new Date() }).where(eq(schema.webhookEvent.id, eventId));
    return { status: 200 as const, outcome };
  };

  if (ORDER_TOPICS.has(headers.topic) && orderGid) {
    await enqueueOrderRefresh(deps.jobs, storeId, orderGid);
    return finish("enqueued_order", "enqueued");
  }
  if (SYNC_TOPICS.has(headers.topic)) {
    await enqueueIncremental(deps.jobs, storeId);
    return finish("enqueued_sync", "enqueued");
  }
  switch (headers.topic) {
    case "app/uninstalled":
      await deps.db.update(schema.storeConnection).set({ status: "revoked", lastError: "App uninstalled in Shopify" }).where(eq(schema.storeConnection.storeId, storeId));
      await deps.db.update(schema.store).set({ status: "uninstalled", uninstalledAt: new Date() }).where(eq(schema.store.id, storeId));
      await audit(deps, row.store.organizationId, storeId, "store.uninstalled", {});
      return finish("uninstalled", "processed");
    case "shop/redact":
      // Sent 48 h after uninstall: erase all store data (cascades to every store-owned table).
      await audit(deps, row.store.organizationId, null, "store.redacted", { shopDomain: headers.shopDomain });
      await deps.db.delete(schema.store).where(eq(schema.store.id, storeId));
      return { status: 200, outcome: "redacted_shop" };
    case "customers/redact": {
      const customer = payload.customer as { id?: number | string } | undefined;
      if (customer?.id !== undefined) {
        await deps.db.delete(schema.customer).where(and(eq(schema.customer.storeId, storeId), eq(schema.customer.shopifyGid, `gid://shopify/Customer/${customer.id}`)));
      }
      await audit(deps, row.store.organizationId, storeId, "customer.redacted", { customerId: customer?.id ?? null });
      return finish("redacted_customers", "processed");
    }
    case "customers/data_request":
      // We hold only a customer GID, country and first-order date; the request is logged for follow-up.
      await audit(deps, row.store.organizationId, storeId, "customer.data_request", { customerId: (payload.customer as { id?: unknown } | undefined)?.id ?? null });
      return finish("data_request_logged", "processed");
    default:
      return finish("ignored_topic", "ignored");
  }
}

async function audit(deps: WebhookDeps, organizationId: string, storeId: string | null, action: string, after: Record<string, unknown>) {
  await deps.db.insert(schema.auditLog).values({ organizationId, storeId, actorUserId: null, action, entityType: "store", entityId: storeId, after });
}
