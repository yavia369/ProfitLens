import { AdsSyncService } from "@profitlens/core/ads";
import { importEcbRates } from "@profitlens/core/fx";
import { QUEUES, type AdsJob, type OrderJob, type PaymentsJob, type StoreJob } from "@profitlens/core/jobs";
import { GatewayApiError, syncablePaymentConnections, syncPaymentGateway } from "@profitlens/core/payments";
import { ProfitService } from "@profitlens/core/profit";
import { ShopifySyncService } from "@profitlens/core/shopify";
import { schema } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { buildDeps, log } from "./deps";

/**
 * Background worker: Shopify backfill, incremental sync (every 15 min), webhook-triggered order refresh,
 * profit recalculation, ad spend (every 6 hours), Stripe/PayPal fee matching (every 6 hours), ECB exchange rates (daily) and nightly reconciliation. Runs as its own process (ARCHITECTURE §7).
 */
async function main() {
  const deps = buildDeps();
  const sync = new ShopifySyncService(deps);
  const profit = new ProfitService(deps.db);
  const ads = new AdsSyncService(deps);
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

  await boss.work<AdsJob>(QUEUES.adsSync, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      log.info({ queue: QUEUES.adsSync, jobId: job.id, accountId: job.data.accountId }, "job started");
      const result = await ads.syncAccount(job.data.accountId, { full: job.data.full ?? false });
      log.info({ queue: QUEUES.adsSync, jobId: job.id, result }, "job finished");
    }
  });
  await boss.work(QUEUES.adsSyncAll, async () => {
    for (const accountId of await ads.syncableAccounts()) await boss.send(QUEUES.adsSync, { accountId } satisfies AdsJob, { singletonKey: accountId, retryLimit: 5, retryBackoff: true });
  });
  await boss.work<PaymentsJob>(QUEUES.paymentsSync, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      log.info({ queue: QUEUES.paymentsSync, jobId: job.id, connectionId: job.data.connectionId }, "job started");
      try {
        const result = await syncPaymentGateway(deps, job.data.connectionId);
        log.info({ queue: QUEUES.paymentsSync, jobId: job.id, result }, "job finished");
      } catch (error) {
        // Rejected credentials are recorded on the connection (needs_reauth); retrying cannot fix them.
        if (error instanceof GatewayApiError && error.kind === "auth") log.warn({ queue: QUEUES.paymentsSync, jobId: job.id, err: error }, "credentials rejected");
        else throw error;
      }
    }
  });
  await boss.work(QUEUES.paymentsSyncAll, async () => {
    for (const connectionId of await syncablePaymentConnections(deps.db))
      await boss.send(QUEUES.paymentsSync, { connectionId } satisfies PaymentsJob, { singletonKey: connectionId, retryLimit: 5, retryBackoff: true });
  });
  await boss.work(QUEUES.incrementalAll, async () => {
    for (const storeId of await activeStores()) await boss.send(QUEUES.incremental, { storeId }, { singletonKey: storeId, retryLimit: 5, retryBackoff: true });
  });
  await boss.work(QUEUES.reconcileAll, async () => {
    for (const storeId of await activeStores()) await boss.send(QUEUES.reconcile, { storeId }, { singletonKey: storeId });
  });
  await boss.work(QUEUES.fxImport, async () => {
    const result = await importEcbRates(deps.db, (url) => fetch(url), { today: new Date().toISOString().slice(0, 10) });
    log.info({ queue: QUEUES.fxImport, result }, "fx import finished");
  });
  await boss.schedule(QUEUES.incrementalAll, "*/15 * * * *");
  // Exchange rates: ECB publishes around 16:00 CET (14:00–15:00 UTC); a second run catches late publications.
  await boss.schedule(QUEUES.fxImport, "25 15,21 * * *", null, { tz: "UTC" });
  await boss.schedule(QUEUES.reconcileAll, "15 2 * * *", null, { tz: "UTC" });
  // Ad spend: every 6 hours (each run re-reads the last 3 days to pick up restatements).
  await boss.schedule(QUEUES.adsSyncAll, "40 */6 * * *", null, { tz: "UTC" });
  // Processor fees: every 6 hours, offset from ad spend (each run re-reads 72 hours; PayPal lists payments up to 3 hours late).
  await boss.schedule(QUEUES.paymentsSyncAll, "10 1-23/6 * * *", null, { tz: "UTC" });

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
