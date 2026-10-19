import { assertRole, assertStoresInScope, schema, TenantAccessError, type Database, type OrgScope } from "@profitlens/db";
import { GATEWAY_MATCH_MINUTES, matchGatewayPayments, type GatewayPayment, type ShopifyPayment } from "@profitlens/finance";
import { GatewayApiError, mapPayPalPayment, mapStripePayment, PAYPAL_MAX_RANGE_DAYS, PayPalClient, StripeClient, type FetchLike } from "@profitlens/payments";
import { and, between, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { ProfitService } from "../profit/service";
import { decryptSecret, encryptSecret, type KeyRing } from "../security/crypto";

export interface PaymentsDeps {
  readonly db: Database;
  readonly keyring: KeyRing;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

export type Gateway = "stripe" | "paypal";
type Credentials = { secretKey: string } | { clientId: string; clientSecret: string };

/** First import reaches this far back (Shopify history without read_all_orders is 60 days anyway). */
export const GATEWAY_BACKFILL_DAYS = 90;
/** Each sync re-reads this much before the last sync (PayPal lists transactions up to 3 hours late, VERIFIED). */
export const GATEWAY_OVERLAP_HOURS = 72;

const keyContext = (id: string) => `payment_connection:${id}:credentials`;
const DAY = 86_400_000;

/** How Shopify names the gateway on transactions (INFERRED: "paypal" for PayPal Express Checkout, "stripe"). */
const SHOPIFY_GATEWAY_PATTERN: Record<Gateway, string> = { stripe: "%stripe%", paypal: "%paypal%" };
const GATEWAY_LABEL: Record<Gateway, string> = { stripe: "Stripe", paypal: "PayPal" };

function stripe(deps: PaymentsDeps, c: { secretKey: string }) {
  return new StripeClient({ secretKey: c.secretKey, ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}) });
}
function paypal(deps: PaymentsDeps, c: { clientId: string; clientSecret: string }) {
  return new PayPalClient({ clientId: c.clientId, clientSecret: c.clientSecret, ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.sleep ? { sleep: deps.sleep } : {}) });
}

/** Processor payments created in [from, to), normalised. */
async function fetchPayments(deps: PaymentsDeps, gateway: Gateway, creds: Credentials, from: Date, to: Date): Promise<GatewayPayment[]> {
  if (gateway === "stripe") {
    const rows = await stripe(deps, creds as { secretKey: string }).balanceTransactions(from, to);
    return rows.map(mapStripePayment).filter((p): p is GatewayPayment => p !== null);
  }
  const client = paypal(deps, creds as { clientId: string; clientSecret: string });
  const out: GatewayPayment[] = [];
  for (let start = from.getTime(); start < to.getTime(); start += PAYPAL_MAX_RANGE_DAYS * DAY) {
    const end = Math.min(start + PAYPAL_MAX_RANGE_DAYS * DAY, to.getTime());
    out.push(...(await client.transactions(new Date(start), new Date(end))).map(mapPayPalPayment).filter((p): p is GatewayPayment => p !== null));
  }
  return out;
}

/**
 * Connects a Stripe or PayPal account to a store with read-only credentials (D-052). The credentials are checked
 * with a one-day read before anything is stored; they are kept encrypted.
 */
export async function connectPaymentGateway(
  deps: PaymentsDeps,
  scope: OrgScope,
  input: { storeId: string; gateway: Gateway; secretKey?: string; clientId?: string; clientSecret?: string },
): Promise<{ connectionId: string }> {
  assertRole(scope, "admin");
  await assertStoresInScope(deps.db, scope, [input.storeId]);
  const creds: Credentials =
    input.gateway === "stripe" ? { secretKey: (input.secretKey ?? "").trim() } : { clientId: (input.clientId ?? "").trim(), clientSecret: (input.clientSecret ?? "").trim() };
  const now = deps.now?.() ?? new Date();
  await fetchPayments(deps, input.gateway, creds, new Date(now.getTime() - DAY), now);
  const displayName = input.gateway === "stripe" ? `Stripe (${(creds as { secretKey: string }).secretKey.slice(0, 8)}…)` : `PayPal (${(creds as { clientId: string }).clientId.slice(0, 6)}…)`;
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.paymentConnection)
      .values({ organizationId: scope.organizationId, storeId: input.storeId, gateway: input.gateway, displayName, credentialsEnc: "pending", status: "active" })
      .onConflictDoUpdate({ target: [schema.paymentConnection.storeId, schema.paymentConnection.gateway], set: { displayName, status: "active", lastError: null, updatedAt: new Date() } })
      .returning({ id: schema.paymentConnection.id });
    await tx.update(schema.paymentConnection).set({ credentialsEnc: encryptSecret(deps.keyring, JSON.stringify(creds), keyContext(row!.id)) }).where(eq(schema.paymentConnection.id, row!.id));
    await tx.insert(schema.auditLog).values({ organizationId: scope.organizationId, storeId: input.storeId, actorUserId: scope.userId, action: "payments.connect", entityType: "payment_connection", entityId: row!.id, after: { gateway: input.gateway, displayName } });
    return { connectionId: row!.id };
  });
}

export interface GatewaySyncResult {
  readonly imported: number;
  readonly matched: number;
  readonly unmatched: number;
  readonly ambiguous: number;
  readonly ordersRecalculated: number;
}

/**
 * Imports processor payments since the last sync (with overlap), re-matches every processor payment in that span
 * to Shopify payments (amount + currency + ±15 minutes, D-052), and recalculates the orders whose fee source changed.
 */
export async function syncPaymentGateway(deps: PaymentsDeps, connectionId: string): Promise<GatewaySyncResult> {
  const db = deps.db;
  const [conn] = await db.select().from(schema.paymentConnection).where(eq(schema.paymentConnection.id, connectionId));
  if (!conn) throw new GatewayApiError("Payment connection not found.", "config", "stripe");
  const now = deps.now?.() ?? new Date();
  const from = conn.syncedThrough ? new Date(conn.syncedThrough.getTime() - GATEWAY_OVERLAP_HOURS * 3_600_000) : new Date(now.getTime() - GATEWAY_BACKFILL_DAYS * DAY);
  try {
    const creds = JSON.parse(decryptSecret(deps.keyring, conn.credentialsEnc, keyContext(conn.id))) as Credentials;
    const payments = await fetchPayments(deps, conn.gateway, creds, from, now);
    for (const p of payments) {
      const values = { amount: p.amount, currency: p.currency, fee: p.fee, feeCurrency: p.feeCurrency, occurredAt: p.occurredAt };
      await db
        .insert(schema.gatewayTransaction)
        .values({ connectionId: conn.id, storeId: conn.storeId, externalId: p.id, ...values, matchStatus: "unmatched" })
        .onConflictDoUpdate({ target: [schema.gatewayTransaction.connectionId, schema.gatewayTransaction.externalId], set: { ...values, updatedAt: new Date() } });
    }

    // Re-match everything in the span (Shopify candidates from a margin either side).
    const margin = GATEWAY_MATCH_MINUTES * 60_000;
    const stored = await db.select().from(schema.gatewayTransaction).where(and(eq(schema.gatewayTransaction.connectionId, conn.id), between(schema.gatewayTransaction.occurredAt, from, now)));
    const others = await db
      .select({ gid: schema.gatewayTransaction.shopifyTransactionGid })
      .from(schema.gatewayTransaction)
      .where(and(eq(schema.gatewayTransaction.storeId, conn.storeId), eq(schema.gatewayTransaction.matchStatus, "matched"), ne(schema.gatewayTransaction.connectionId, conn.id)));
    const taken = new Set(others.map((o) => o.gid));
    const shopifyRows = await db
      .select({ gid: schema.paymentTransaction.shopifyGid, orderId: schema.paymentTransaction.orderId, processedAt: schema.paymentTransaction.processedAt, amount: schema.paymentTransaction.amount, currency: schema.paymentTransaction.currency })
      .from(schema.paymentTransaction)
      .where(
        and(
          eq(schema.paymentTransaction.storeId, conn.storeId),
          sql`lower(${schema.paymentTransaction.gateway}) like ${SHOPIFY_GATEWAY_PATTERN[conn.gateway]}`,
          inArray(schema.paymentTransaction.kind, ["SALE", "CAPTURE"]),
          eq(schema.paymentTransaction.status, "SUCCESS"),
          between(schema.paymentTransaction.processedAt, new Date(from.getTime() - margin), new Date(now.getTime() + margin)),
        ),
      );
    const shopify: ShopifyPayment[] = shopifyRows.filter((r) => r.processedAt && !taken.has(r.gid)).map((r) => ({ id: r.gid, processedAt: r.processedAt!, amount: r.amount, currency: r.currency }));
    const matches = matchGatewayPayments(
      stored.map((g) => ({ id: g.externalId, occurredAt: g.occurredAt, amount: g.amount, currency: g.currency, fee: g.fee, feeCurrency: g.feeCurrency })),
      shopify,
    );
    const orderOf = new Map(shopifyRows.map((r) => [r.gid, r.orderId]));
    const changedOrders = new Set<string>();
    const byExt = new Map(stored.map((g) => [g.externalId, g]));
    await db.transaction(async (tx) => {
      // Clear first so a GID can move between gateway records without hitting the unique constraint.
      await tx
        .update(schema.gatewayTransaction)
        .set({ shopifyTransactionGid: null })
        .where(and(eq(schema.gatewayTransaction.connectionId, conn.id), between(schema.gatewayTransaction.occurredAt, from, now)));
      for (const m of matches) {
        const g = byExt.get(m.gatewayId)!;
        const gid = m.status === "matched" ? m.shopifyId : null;
        if (gid !== g.shopifyTransactionGid) {
          for (const x of [gid, g.shopifyTransactionGid]) {
            const o = x ? orderOf.get(x) : undefined;
            if (o) changedOrders.add(o);
          }
        }
        await tx
          .update(schema.gatewayTransaction)
          .set({ matchStatus: m.status, matchReason: m.status === "matched" ? null : m.reason, shopifyTransactionGid: gid, updatedAt: new Date() })
          .where(eq(schema.gatewayTransaction.id, g.id));
      }
    });
    await db.update(schema.paymentConnection).set({ syncedThrough: now, lastSyncedAt: now, lastError: null, status: "active" }).where(eq(schema.paymentConnection.id, conn.id));
    const recalculated = changedOrders.size ? await new ProfitService(db).recalcOrders(conn.storeId, [...changedOrders]) : { computed: 0 };
    return {
      imported: payments.length,
      matched: matches.filter((m) => m.status === "matched").length,
      unmatched: matches.filter((m) => m.status === "unmatched").length,
      ambiguous: matches.filter((m) => m.status === "ambiguous").length,
      ordersRecalculated: recalculated.computed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const auth = error instanceof GatewayApiError && error.kind === "auth";
    await db.update(schema.paymentConnection).set({ lastError: message.slice(0, 500), ...(auth ? { status: "needs_reauth" as const } : {}) }).where(eq(schema.paymentConnection.id, conn.id));
    throw error;
  }
}

export async function listPaymentConnections(db: Database, scope: OrgScope) {
  return db
    .select({
      id: schema.paymentConnection.id,
      storeId: schema.paymentConnection.storeId,
      storeName: schema.store.name,
      gateway: schema.paymentConnection.gateway,
      displayName: schema.paymentConnection.displayName,
      status: schema.paymentConnection.status,
      lastError: schema.paymentConnection.lastError,
      lastSyncedAt: schema.paymentConnection.lastSyncedAt,
      matched: sql<number>`(select count(*)::int from gateway_transaction g where g.connection_id = ${schema.paymentConnection.id} and g.match_status = 'matched')`,
      open: sql<number>`(select count(*)::int from gateway_transaction g where g.connection_id = ${schema.paymentConnection.id} and g.match_status <> 'matched')`,
    })
    .from(schema.paymentConnection)
    .innerJoin(schema.store, eq(schema.store.id, schema.paymentConnection.storeId))
    .where(eq(schema.paymentConnection.organizationId, scope.organizationId));
}

/** Connections the scheduled sync runs for (active ones; a connection needing new credentials waits for the user). */
export async function syncablePaymentConnections(db: Database): Promise<string[]> {
  return (await db.select({ id: schema.paymentConnection.id }).from(schema.paymentConnection).where(eq(schema.paymentConnection.status, "active"))).map((r) => r.id);
}

/** Processor payments that are not matched (their Shopify orders keep the rule estimate), newest first. */
export async function listUnmatchedGatewayPayments(db: Database, scope: OrgScope, connectionId: string, limit = 50) {
  const [conn] = await db.select({ org: schema.paymentConnection.organizationId }).from(schema.paymentConnection).where(eq(schema.paymentConnection.id, connectionId));
  if (conn?.org !== scope.organizationId) throw new TenantAccessError("payment connection not in this organization");
  return db
    .select({ externalId: schema.gatewayTransaction.externalId, occurredAt: schema.gatewayTransaction.occurredAt, amount: schema.gatewayTransaction.amount, currency: schema.gatewayTransaction.currency, fee: schema.gatewayTransaction.fee, feeCurrency: schema.gatewayTransaction.feeCurrency, status: schema.gatewayTransaction.matchStatus, reason: schema.gatewayTransaction.matchReason })
    .from(schema.gatewayTransaction)
    .where(and(eq(schema.gatewayTransaction.connectionId, connectionId), ne(schema.gatewayTransaction.matchStatus, "matched")))
    .orderBy(desc(schema.gatewayTransaction.occurredAt))
    .limit(limit);
}

export { GatewayApiError } from "@profitlens/payments";
export const GATEWAYS: readonly Gateway[] = ["stripe", "paypal"];
export { GATEWAY_LABEL };
