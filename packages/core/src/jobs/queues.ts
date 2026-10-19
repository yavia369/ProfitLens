/** Background job queues (pg-boss). Shared by the web app (enqueue) and the worker (process). */
export const QUEUES = {
  backfill: "shopify.backfill",
  incremental: "shopify.incremental",
  order: "shopify.order",
  reconcile: "shopify.reconcile",
  /** Recalculate every order of a store (policy change, large cost edits). */
  recalcStore: "profit.recalc-store",
  /** Google Ads spend for one ad account ({ accountId, full? }). */
  adsSync: "ads.google.sync",
  /** Cron fan-out: sync every mapped, enabled Google Ads account. */
  adsSyncAll: "ads.google.sync-all",
  /** Cron fan-out: enqueue an incremental sync for every active store. */
  incrementalAll: "shopify.incremental-all",
  reconcileAll: "shopify.reconcile-all",
  /** ECB reference rates into fx_rate (daily, after ECB publishes around 16:00 CET). */
  fxImport: "fx.ecb.import",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface StoreJob {
  storeId: string;
}

export interface AdsJob {
  accountId: string;
  /** Re-import the full history instead of the last days. */
  full?: boolean;
}

export interface OrderJob extends StoreJob {
  orderGid: string;
}

/** Minimal sender interface (satisfied by PgBoss) so callers don't depend on pg-boss types. */
export interface JobSender {
  send(name: string, data?: object | null, options?: { singletonKey?: string; retryLimit?: number; retryDelay?: number; retryBackoff?: boolean; startAfter?: number | string | Date }): Promise<string | null>;
}

const retry = { retryLimit: 5, retryDelay: 30, retryBackoff: true };

export function enqueueBackfill(boss: JobSender, storeId: string) {
  return boss.send(QUEUES.backfill, { storeId } satisfies StoreJob, { ...retry, singletonKey: storeId });
}

export function enqueueIncremental(boss: JobSender, storeId: string) {
  return boss.send(QUEUES.incremental, { storeId } satisfies StoreJob, { ...retry, singletonKey: storeId });
}

export function enqueueOrderRefresh(boss: JobSender, storeId: string, orderGid: string) {
  return boss.send(QUEUES.order, { storeId, orderGid } satisfies OrderJob, { ...retry, singletonKey: `${storeId}:${orderGid}` });
}

export function enqueueRecalcStore(boss: JobSender, storeId: string) {
  return boss.send(QUEUES.recalcStore, { storeId } satisfies StoreJob, { ...retry, singletonKey: storeId });
}

export function enqueueAdsSync(boss: JobSender, accountId: string, full = false) {
  return boss.send(QUEUES.adsSync, { accountId, full } satisfies AdsJob, { ...retry, singletonKey: accountId });
}
