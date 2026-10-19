import { schema } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { clientForStore, ConnectionError, type ShopifyDeps } from "./connection";

/**
 * Topics ProfitLens subscribes to through the Admin API (shop-scoped subscriptions; VERIFIED in the 2026-10
 * schema: `webhookSubscriptionCreate(topic, webhookSubscription: { uri })`). Each one maps to a handler branch in
 * `webhooks.ts`. The compliance topics (customers/data_request, customers/redact, shop/redact) cannot be created
 * through the API; they are set in the app's configuration in the Dev Dashboard (docs/DEPLOYMENT.md).
 */
export const WEBHOOK_TOPICS = [
  "APP_UNINSTALLED",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_EDITED",
  "ORDERS_CANCELLED",
  "ORDERS_PAID",
  "ORDERS_FULFILLED",
  "ORDERS_PARTIALLY_FULFILLED",
  "REFUNDS_CREATE",
  "ORDER_TRANSACTIONS_CREATE",
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "INVENTORY_ITEMS_UPDATE",
  "DISPUTES_CREATE",
  "DISPUTES_UPDATE",
] as const;
export const WEBHOOK_PATH = "/api/webhooks/shopify";

const LIST = `query WebhookSubscriptions($after: String) {
  webhookSubscriptions(first: 100, after: $after) { nodes { id topic uri } pageInfo { hasNextPage endCursor } }
}`;
const CREATE = `mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { webhookSubscription { id } userErrors { field message } }
}`;
const DELETE = `mutation WebhookSubscriptionDelete($id: ID!) {
  webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } }
}`;

interface Sub {
  id: string;
  topic: string;
  uri: string;
}
type UserErrors = { field: string[] | null; message: string }[];

export interface WebhookRegistration {
  readonly endpoint: string;
  readonly created: string[];
  readonly kept: string[];
  /** Subscriptions to an older ProfitLens endpoint (previous domain) that were replaced. */
  readonly replaced: string[];
}

/**
 * Makes the store's webhook subscriptions point at `${appUrl}/api/webhooks/shopify` for every topic in
 * WEBHOOK_TOPICS. Idempotent: existing correct subscriptions are kept, ones pointing at another ProfitLens
 * endpoint (a previous domain) are deleted and recreated, other apps' or unrelated subscriptions are untouched.
 * Requires a public HTTPS app URL (Shopify only delivers to HTTPS).
 */
export async function registerShopifyWebhooks(deps: ShopifyDeps, storeId: string, appUrl: string): Promise<WebhookRegistration> {
  const base = new URL(appUrl);
  if (base.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(base.hostname)) {
    throw new ConnectionError("Webhooks need the app's public HTTPS address (APP_URL). Until it is deployed, the 15-minute sync keeps data fresh.", "invalid_input");
  }
  const endpoint = new URL(WEBHOOK_PATH, base).toString();
  const { client } = await clientForStore(deps, storeId);

  const existing: Sub[] = [];
  let after: string | null = null;
  do {
    const page: { data: { webhookSubscriptions: { nodes: Sub[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await client.request(LIST, { after }, 10);
    existing.push(...page.data.webhookSubscriptions.nodes);
    after = page.data.webhookSubscriptions.pageInfo.hasNextPage ? page.data.webhookSubscriptions.pageInfo.endCursor : null;
  } while (after);

  const created: string[] = [];
  const kept: string[] = [];
  const replaced: string[] = [];
  const fail = (what: string, errors: UserErrors) => {
    throw new ConnectionError(`Shopify refused to ${what}: ${errors.map((e) => e.message).join("; ")}`, "invalid_input");
  };
  for (const topic of WEBHOOK_TOPICS) {
    const mine = existing.filter((s) => s.topic === topic && new URL(s.uri).pathname === WEBHOOK_PATH);
    if (mine.some((s) => s.uri === endpoint)) {
      kept.push(topic);
      continue;
    }
    for (const old of mine) {
      const r = await client.request<{ webhookSubscriptionDelete: { userErrors: UserErrors } }>(DELETE, { id: old.id }, 10);
      if (r.data.webhookSubscriptionDelete.userErrors.length) fail(`remove the old ${topic} subscription`, r.data.webhookSubscriptionDelete.userErrors);
      replaced.push(topic);
    }
    const r = await client.request<{ webhookSubscriptionCreate: { userErrors: UserErrors } }>(CREATE, { topic, sub: { uri: endpoint, format: "JSON" } }, 10);
    if (r.data.webhookSubscriptionCreate.userErrors.length) fail(`subscribe to ${topic}`, r.data.webhookSubscriptionCreate.userErrors);
    created.push(topic);
  }
  const [store] = await deps.db.select({ org: schema.store.organizationId }).from(schema.store).where(eq(schema.store.id, storeId));
  if (store && (created.length || replaced.length)) {
    await deps.db.insert(schema.auditLog).values({ organizationId: store.org, storeId, actorUserId: null, action: "webhooks.register", entityType: "store", entityId: storeId, after: { endpoint, created, replaced } });
  }
  return { endpoint, created, kept, replaced };
}
