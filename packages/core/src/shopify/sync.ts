import { addDays, localDateOf, todayIn } from "@profitlens/finance";
import { schema } from "@profitlens/db";
import {
  assembleBulkJsonl,
  bulkOrdersQuery,
  bulkProductsQuery,
  DISPUTES_QUERY,
  downloadJsonl,
  hasTruncatedConnections,
  mapDispute,
  mapOrder,
  mapProduct,
  ORDER_BY_ID_QUERY,
  ORDERS_COUNT_QUERY,
  ordersCreatedBetween,
  ordersUpdatedSince,
  PAGED_ORDERS_QUERY,
  PAGED_PRODUCTS_QUERY,
  ShopifyError,
  startBulkQuery,
  waitForBulk,
  type RawDispute,
  type RawOrder,
  type RawProduct,
} from "@profitlens/shopify";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { ProfitService, type AmountMismatch } from "../profit/service";
import { clientForStore, type ShopifyDeps, type StoreClient } from "./connection";
import { refreshCustomerStats, relinkLineItemVariants, upsertOrderFacts, upsertProductFacts } from "./upsert";

/** Overlap window re-read on every incremental sync, so late/ out-of-order updates are not missed. */
const OVERLAP_MS = 5 * 60_000;
/** Cost versions seeded from Shopify start here (before any possible order). */
const COST_SEED_FROM = "2000-01-01";

export interface SyncStats {
  orders: number;
  ordersSkippedStale: number;
  products: number;
  variants: number;
  costVersionsCreated: number;
  disputes: number;
  /** Orders whose profit result was recalculated after the sync. */
  ordersRecalculated: number;
}

const emptyStats = (): SyncStats => ({ orders: 0, ordersSkippedStale: 0, products: 0, variants: 0, costVersionsCreated: 0, disputes: 0, ordersRecalculated: 0 });

/** What a sync run changed, so only the affected orders are recalculated. */
interface Touched {
  readonly orders: Set<string>;
  readonly variants: Set<string>;
}
const touched = (): Touched => ({ orders: new Set(), variants: new Set() });

type JobKind = "shopify.backfill" | "shopify.incremental" | "shopify.reconcile" | "shopify.order";

export class ShopifySyncService {
  private readonly profit: ProfitService;

  constructor(private readonly deps: ShopifyDeps) {
    this.profit = new ProfitService(deps.db);
  }

  /** Recalculates orders changed by a sync run, plus orders of variants whose Shopify cost changed. */
  private async recalcTouched(storeId: string, t: Touched, stats: SyncStats): Promise<void> {
    const ids = new Set(t.orders);
    for (const id of await this.profit.ordersWithVariants(storeId, [...t.variants], "1900-01-01")) ids.add(id);
    stats.ordersRecalculated += (await this.profit.recalcOrders(storeId, [...ids])).computed;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** Records a user-visible job row around `fn` (Sync Center). Errors are stored and re-thrown. */
  private async tracked<T extends { stats?: SyncStats }>(storeId: string, kind: JobKind, fn: (progress: (done: number, total: number | null, unit: string) => Promise<void>) => Promise<T>): Promise<T> {
    const { db } = this.deps;
    const [st] = await db.select({ organizationId: schema.store.organizationId }).from(schema.store).where(eq(schema.store.id, storeId));
    if (!st) throw new ShopifyError("Unknown store", "config");
    const [job] = await db
      .insert(schema.syncJob)
      .values({ organizationId: st.organizationId, storeId, kind, status: "running", startedAt: this.now(), attempts: 1 })
      .returning({ id: schema.syncJob.id });
    const progress = async (done: number, total: number | null, unit: string) => {
      await db.update(schema.syncJob).set({ progress: { done, total, unit } }).where(eq(schema.syncJob.id, job!.id));
    };
    try {
      const result = await fn(progress);
      await db
        .update(schema.syncJob)
        .set({ status: "succeeded", finishedAt: this.now(), stats: (result.stats ?? {}) as unknown as Record<string, number> })
        .where(eq(schema.syncJob.id, job!.id));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(schema.syncJob).set({ status: "failed", finishedAt: this.now(), lastError: message.slice(0, 2000) }).where(eq(schema.syncJob.id, job!.id));
      if (error instanceof ShopifyError && error.kind === "auth") {
        await db.update(schema.storeConnection).set({ status: "needs_reauth", lastError: message.slice(0, 500) }).where(eq(schema.storeConnection.storeId, storeId));
      }
      throw error;
    }
  }

  private async saveProducts(sc: StoreClient, products: RawProduct[], stats: SyncStats, t: Touched): Promise<void> {
    const today = todayIn(sc.store.ianaTimezone, this.now());
    for (const raw of products) {
      const r = await upsertProductFacts(this.deps.db, sc.store.id, sc.store.currency, mapProduct(raw), today, COST_SEED_FROM);
      stats.products += 1;
      stats.variants += r.variants;
      stats.costVersionsCreated += r.costVersionsCreated;
      for (const v of r.costChangedVariantIds) t.variants.add(v);
    }
  }

  private async saveOrders(sc: StoreClient, orders: RawOrder[], stats: SyncStats, t: Touched): Promise<Date | null> {
    let maxUpdated: Date | null = null;
    for (const raw of orders) {
      const facts = mapOrder(raw, sc.store.ianaTimezone);
      const r = await upsertOrderFacts(this.deps.db, sc.store.id, facts);
      if (r.applied) stats.orders += 1;
      else stats.ordersSkippedStale += 1;
      if (r.orderId) t.orders.add(r.orderId);
      if (!maxUpdated || facts.order.shopifyUpdatedAt > maxUpdated) maxUpdated = facts.order.shopifyUpdatedAt;
    }
    return maxUpdated;
  }

  /** Paged fallback for any order whose nested connections were truncated by page limits. */
  private async refetchOrder(sc: StoreClient, gid: string): Promise<RawOrder | null> {
    const { data } = await sc.client.request<{ order: RawOrder | null }>(ORDER_BY_ID_QUERY, { id: gid }, 200);
    return data.order;
  }

  /**
   * Full historical import via Bulk Operations: products first (so line items link to variants),
   * then all orders. Safe to re-run: every write is an idempotent upsert.
   */
  async backfill(storeId: string): Promise<{ stats: SyncStats; historyStart: string | null }> {
    return this.tracked(storeId, "shopify.backfill", async (progress) => {
      const sc = await clientForStore(this.deps, storeId);
      const stats = emptyStats();
      const t = touched();
      const startedAt = this.now();
      await this.deps.db.update(schema.storeConnection).set({ backfillStartedAt: startedAt }).where(eq(schema.storeConnection.storeId, storeId));
      const sleepOpt = this.deps.sleep ? { sleep: this.deps.sleep } : {};
      const fetchText = this.deps.fetch ? (u: string) => this.deps.fetch!(u, { method: "GET", headers: {} }) : undefined;

      // Products
      const productsOp = await startBulkQuery(sc.client, bulkProductsQuery());
      const productsDone = await waitForBulk(sc.client, productsOp, { ...sleepOpt, onProgress: (s) => void progress(Number(s.objectCount), null, "product objects") });
      if (productsDone.url) await this.saveProducts(sc, assembleBulkJsonl<RawProduct>(await downloadJsonl(productsDone.url, fetchText)), stats, t);

      // Orders (read_orders alone covers the last 60 days; read_all_orders lifts that limit)
      const ordersOp = await startBulkQuery(sc.client, bulkOrdersQuery("updated_at:>='2000-01-01T00:00:00Z'"));
      const ordersDone = await waitForBulk(sc.client, ordersOp, { ...sleepOpt, onProgress: (s) => void progress(Number(s.rootObjectCount), null, "orders exported") });
      let maxUpdated: Date | null = null;
      if (ordersDone.url) {
        const orders = assembleBulkJsonl<RawOrder>(await downloadJsonl(ordersDone.url, fetchText));
        await progress(0, orders.length, "orders saved");
        for (let i = 0; i < orders.length; i += 100) {
          // Bulk exports omit refund lines, so refunded orders are completed with the paged query.
          // An order deleted since the export (refetch returns null) is skipped rather than saved partially.
          const batch: RawOrder[] = [];
          for (const o of orders.slice(i, i + 100)) {
            const full = hasTruncatedConnections(o) ? await this.refetchOrder(sc, o.id) : o;
            if (full) batch.push(full);
          }
          const m = await this.saveOrders(sc, batch, stats, t);
          if (m && (!maxUpdated || m > maxUpdated)) maxUpdated = m;
          await progress(Math.min(i + 100, orders.length), orders.length, "orders saved");
        }
      }
      await relinkLineItemVariants(this.deps.db, storeId);
      await refreshCustomerStats(this.deps.db, storeId);
      stats.disputes = await this.syncDisputes(sc, t);
      // A backfill touches every order (and seeds costs), so the whole store is recalculated.
      stats.ordersRecalculated = (await this.profit.recalcStore(storeId)).computed;

      const [earliest] = await this.deps.db
        .select({ d: sql<string | null>`min(${schema.order.processedLocalDate})` })
        .from(schema.order)
        .where(eq(schema.order.storeId, storeId));
      const historyStart = earliest?.d ?? null;
      await this.deps.db
        .update(schema.storeConnection)
        .set({
          backfillCompletedAt: this.now(),
          historyStart,
          // Start incremental from the backfill start (minus overlap) to cover changes made while exporting.
          ordersSyncedThrough: new Date(Math.min(startedAt.getTime(), (maxUpdated ?? startedAt).getTime())),
          productsSyncedThrough: startedAt,
          disputesSyncedAt: this.now(),
        })
        .where(eq(schema.storeConnection.storeId, storeId));
      return { stats, historyStart };
    });
  }

  /** Incremental sync of orders and products updated since the last checkpoint (minus an overlap window). */
  async incremental(storeId: string): Promise<{ stats: SyncStats }> {
    return this.tracked(storeId, "shopify.incremental", async () => {
      const sc = await clientForStore(this.deps, storeId);
      const stats = emptyStats();
      const t = touched();
      const runStartedAt = this.now();
      const ordersSince = new Date((sc.connection.ordersSyncedThrough ?? new Date(runStartedAt.getTime() - 60 * 86_400_000)).getTime() - OVERLAP_MS);
      const productsSince = new Date((sc.connection.productsSyncedThrough ?? new Date(0)).getTime() - OVERLAP_MS);

      // Products
      for (let after: string | null = null; ; ) {
        const { data }: { data: { products: { edges: { node: RawProduct }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await sc.client.request(
          PAGED_PRODUCTS_QUERY,
          { after, query: `updated_at:>='${productsSince.toISOString()}'` },
          150,
        );
        await this.saveProducts(sc, data.products.edges.map((e) => e.node), stats, t);
        if (!data.products.pageInfo.hasNextPage) break;
        after = data.products.pageInfo.endCursor;
      }

      // Orders
      let maxUpdated: Date | null = null;
      for (let after: string | null = null; ; ) {
        const { data }: { data: { orders: { edges: { node: RawOrder }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } } = await sc.client.request(
          PAGED_ORDERS_QUERY,
          { query: ordersUpdatedSince(ordersSince.toISOString()), after },
          500,
        );
        const batch: RawOrder[] = [];
        for (const e of data.orders.edges) batch.push(hasTruncatedConnections(e.node) ? ((await this.refetchOrder(sc, e.node.id)) ?? e.node) : e.node);
        const m = await this.saveOrders(sc, batch, stats, t);
        if (m && (!maxUpdated || m > maxUpdated)) maxUpdated = m;
        if (!data.orders.pageInfo.hasNextPage) break;
        after = data.orders.pageInfo.endCursor;
      }
      await relinkLineItemVariants(this.deps.db, storeId);
      await refreshCustomerStats(this.deps.db, storeId);

      // Disputes change rarely; refresh at most every 6 hours.
      if (!sc.connection.disputesSyncedAt || runStartedAt.getTime() - sc.connection.disputesSyncedAt.getTime() > 6 * 3600_000) {
        stats.disputes = await this.syncDisputes(sc, t);
      }
      await this.recalcTouched(storeId, t, stats);
      await this.deps.db
        .update(schema.storeConnection)
        .set({
          ordersSyncedThrough: maxUpdated && maxUpdated > ordersSince ? maxUpdated : sc.connection.ordersSyncedThrough ?? runStartedAt,
          productsSyncedThrough: runStartedAt,
          ...(stats.disputes ? { disputesSyncedAt: runStartedAt } : {}),
        })
        .where(eq(schema.storeConnection.storeId, storeId));
      return { stats };
    });
  }

  /** Re-fetches one order (used by webhooks: payloads may be stale or out of order, so read the source of truth). */
  async syncOrder(storeId: string, orderGid: string): Promise<{ stats: SyncStats }> {
    return this.tracked(storeId, "shopify.order", async () => {
      const sc = await clientForStore(this.deps, storeId);
      const stats = emptyStats();
      const raw = await this.refetchOrder(sc, orderGid);
      const t = touched();
      if (raw) await this.saveOrders(sc, [raw], stats, t);
      await this.recalcTouched(storeId, t, stats);
      return { stats };
    });
  }

  private async syncDisputes(sc: StoreClient, t: Touched): Promise<number> {
    if (!sc.scopes.includes("read_shopify_payments_disputes")) return 0;
    let count = 0;
    for (let after: string | null = null; ; ) {
      type DisputesPage = { disputes: { edges: { node: RawDispute }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
      let data: DisputesPage;
      try {
        ({ data } = await sc.client.request<DisputesPage>(DISPUTES_QUERY, { after }, 50));
      } catch (e) {
        // Stores without Shopify Payments have no account; treat as no disputes.
        if (e instanceof ShopifyError && e.kind === "graphql") return count;
        throw e;
      }
      for (const { node } of data.disputes.edges) {
        const d = mapDispute(node);
        const orderRow = d.orderGid
          ? await this.deps.db.select({ id: schema.order.id }).from(schema.order).where(and(eq(schema.order.storeId, sc.store.id), eq(schema.order.shopifyGid, d.orderGid))).limit(1)
          : [];
        const values = { storeId: sc.store.id, orderId: orderRow[0]?.id ?? null, shopifyGid: d.shopifyGid, type: d.type, status: d.status, reason: d.reason, amount: d.amount, currency: d.currency, initiatedAt: d.initiatedAt, finalizedOn: d.finalizedOn };
        await this.deps.db
          .insert(schema.dispute)
          .values(values)
          .onConflictDoUpdate({ target: [schema.dispute.storeId, schema.dispute.shopifyGid], set: { orderId: values.orderId, status: values.status, reason: values.reason, amount: values.amount, finalizedOn: values.finalizedOn, updatedAt: new Date() } });
        if (values.orderId) t.orders.add(values.orderId);
        count += 1;
      }
      if (!data.disputes.pageInfo.hasNextPage) return count;
      after = data.disputes.pageInfo.endCursor;
    }
  }

  /**
   * Compares order counts per store-local day with Shopify (closed days only) and records differences.
   * Returns the days that did not match (callers can trigger a targeted re-sync).
   */
  async reconcileOrderCounts(
    storeId: string,
    days = 7,
  ): Promise<{ stats: SyncStats; mismatches: { date: string; shopify: number; ours: number }[]; amountMismatches: AmountMismatch[] }> {
    return this.tracked(storeId, "shopify.reconcile", async () => {
      const sc = await clientForStore(this.deps, storeId);
      const tz = sc.store.ianaTimezone;
      const today = todayIn(tz, this.now());
      const mismatches: { date: string; shopify: number; ours: number }[] = [];
      for (let i = 1; i <= days; i++) {
        const day = addDays(today, -i);
        if (sc.connection.historyStart && day < sc.connection.historyStart) break;
        const { fromIso, toIso } = dayBoundsUtc(day, tz);
        const { data } = await sc.client.request<{ ordersCount: { count: number; precision: string } }>(ORDERS_COUNT_QUERY, { query: ordersCreatedBetween(fromIso, toIso) }, 10);
        const [ours] = await this.deps.db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.order)
          .where(and(eq(schema.order.storeId, storeId), gte(schema.order.createdAtShopify, new Date(fromIso)), lt(schema.order.createdAtShopify, new Date(toIso))));
        const n = ours?.n ?? 0;
        if (data.ordersCount.count !== n) {
          mismatches.push({ date: day, shopify: data.ordersCount.count, ours: n });
          await this.deps.db.insert(schema.reconciliationIssue).values({ storeId, localDate: day, metric: "orders_count", expected: String(data.ordersCount.count), actual: String(n), difference: String(data.ordersCount.count - n) });
        }
      }
      // Amounts: aggregates vs an independent recomputation from the raw ledger (FINANCIAL_MODEL §10).
      const amountMismatches = await this.profit.reconcileAmounts(storeId, addDays(today, -days), addDays(today, -1));
      return { stats: emptyStats(), mismatches, amountMismatches };
    });
  }
}

/** UTC instants bounding a store-local calendar day (handles DST: 23/25-hour days). */
export function dayBoundsUtc(day: string, timeZone: string): { fromIso: string; toIso: string } {
  return { fromIso: localMidnightUtc(day, timeZone).toISOString(), toIso: localMidnightUtc(addDays(day, 1), timeZone).toISOString() };
}

function localMidnightUtc(day: string, timeZone: string): Date {
  // Find the UTC instant whose local date in `timeZone` first equals `day` (search ±14h around UTC midnight).
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  let lo = utcMidnight - 15 * 3600_000;
  let hi = utcMidnight + 15 * 3600_000;
  // Invariant: local(lo) < day <= local(hi). Narrow to 1 ms; hi is then the first instant of `day`.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateOf(new Date(mid), timeZone) < day) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}
