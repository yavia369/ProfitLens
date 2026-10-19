import { QUEUES, type OrderJob, type StoreJob } from "@profitlens/core/jobs";
import { ProfitService } from "@profitlens/core/profit";
import { ShopifySyncService } from "@profitlens/core/shopify";
import { schema } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { buildDeps, log } from "./deps";

/**
 * Background worker: Shopify backfill, incremental sync (every 15 min), webhook-triggered order refresh,
 * profit recalculation and nightly reconciliation. Runs as its own process (ARCHITECTURE §7).
 */
async function main() {
  const deps = buildDeps();
  const sync = new ShopifySyncService(deps);
  const profit = new ProfitService(deps.db);
  const boss = new PgBoss({ connectionString: deps.databaseUrl, schema: "pgboss" });
  boss.on("error", (error) => log.error({ err: error }, "pg-boss error"));
  await boss.start();
  for (const name of Object.values(QUEUES)) await boss.createQueue(name);

  const activeStores = async () =>
    (await deps.db.select({ id: schema.store.id }).from(schema.store).innerJoin(schema.storeConnection, eq(schema.storeConnection.storeId, schema.store.id)).where(eq(schema.storeConnection.status, "active"))).map((r) => r.id);

  const run = <T extends StoreJob>(name: string, fn: (data: T) => Promise<unknown>) =>
    boss.work<T>(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        log.info({ queue: name, jobId: job.id, storeId: job.data.storeId }, "job started");
        try {
          const result = await fn(job.data);
          log.info({ queue: name, jobId: job.id, ms: Date.now() - started, result }, "job finished");
        } catch (error) {
          log.error({ queue: name, jobId: job.id, err: error }, "job failed");
          throw error; // pg-boss retries with backoff
        }
      }
    });

  await run<StoreJob>(QUEUES.backfill, (d) => sync.backfill(d.storeId));
  await run<StoreJob>(QUEUES.incremental, (d) => sync.incremental(d.storeId));
  await run<OrderJob>(QUEUES.order, (d) => sync.syncOrder(d.storeId, d.orderGid));
  await run<StoreJob>(QUEUES.reconcile, (d) => sync.reconcileOrderCounts(d.storeId));
  await run<StoreJob>(QUEUES.recalcStore, (d) => profit.recalcStore(d.storeId));

  await boss.work(QUEUES.incrementalAll, async () => {
    for (const storeId of await activeStores()) await boss.send(QUEUES.incremental, { storeId }, { singletonKey: storeId, retryLimit: 5, retryBackoff: true });
  });
  await boss.work(QUEUES.reconcileAll, async () => {
    for (const storeId of await activeStores()) await boss.send(QUEUES.reconcile, { storeId }, { singletonKey: storeId });
  });
  await boss.schedule(QUEUES.incrementalAll, "*/15 * * * *");
  await boss.schedule(QUEUES.reconcileAll, "15 2 * * *", null, { tz: "UTC" });

  log.info("worker started");
  const shutdown = async (signal: string) => {
    log.info({ signal }, "worker stopping");
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  log.fatal({ err: error }, "worker crashed");
  process.exit(1);
});
