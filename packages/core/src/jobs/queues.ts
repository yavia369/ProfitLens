/** Background job queues (pg-boss). Shared by the web app (enqueue) and the worker (process). */
export const QUEUES = {
  backfill: "shopify.backfill",
  incremental: "shopify.incremental",
  order: "shopify.order",
  reconcile: "shopify.reconcile",
  /** Cron fan-out: enqueue an incremental sync for every active store. */
  incrementalAll: "shopify.incremental-all",
  reconcileAll: "shopify.reconcile-all",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface StoreJob {
  storeId: string;
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
