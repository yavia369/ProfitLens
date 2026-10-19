import { createDb, createPool, type Database } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { sql } from "drizzle-orm";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { failedJobsFor, healthReport, pruneWorkerHeartbeats, recordWorkerHeartbeat, WORKER_STALE_SECONDS } from "../src/ops";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
let url: string;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  url = await freshTestDatabase(baseUrl, "ops");
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("DROP SCHEMA IF EXISTS pgboss CASCADE");
  await admin.end();
  pool = createPool(url, 4);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});

describe("health and failed jobs", () => {
  it("reports a missing worker and an uninitialised queue as degraded, a fresh heartbeat as ok", async () => {
    const now = new Date();
    let r = await healthReport(db, now);
    expect(r).toMatchObject({ status: "degraded", database: { ok: true }, worker: { ok: false, lastBeatSecondsAgo: null }, queue: { ok: false, lagSeconds: null } });

    await recordWorkerHeartbeat(db, { id: "w1", startedAt: new Date(now.getTime() - 3_600_000) }, new Date(now.getTime() - (WORKER_STALE_SECONDS + 60) * 1000));
    r = await healthReport(db, now);
    expect(r.worker).toEqual({ ok: false, lastBeatSecondsAgo: WORKER_STALE_SECONDS + 60 });

    await recordWorkerHeartbeat(db, { id: "w1", startedAt: new Date(now.getTime() - 3_600_000) }, new Date(now.getTime() - 30_000));
    r = await healthReport(db, now);
    expect(r.worker).toEqual({ ok: true, lastBeatSecondsAgo: 30 });

    await recordWorkerHeartbeat(db, { id: "old", startedAt: new Date(0) }, new Date(now.getTime() - 2 * 86_400_000));
    await pruneWorkerHeartbeats(db, now);
    const rows = (await db.execute(sql`select worker_id from worker_heartbeat`)) as unknown as { rows: { worker_id: string }[] };
    expect(rows.rows.map((x) => x.worker_id)).toEqual(["w1"]);
  });

  it("measures queue lag and lists jobs that failed after their retries, only for the given ids", async () => {
    const boss = new PgBoss({ connectionString: url, schema: "pgboss", supervise: false, schedule: false });
    await boss.start();
    try {
      await boss.createQueue("shopify.incremental");
      await boss.send("shopify.incremental", { storeId: "store-a" }, { retryLimit: 0 });
      await boss.send("shopify.incremental", { storeId: "store-b" }, { retryLimit: 0 });
      const now = new Date(Date.now() + 120_000); // two minutes after the jobs became due
      await recordWorkerHeartbeat(db, { id: "w1", startedAt: new Date() }, now);
      let r = await healthReport(db, now);
      expect(r.queue.ok).toBe(true);
      expect(r.queue.lagSeconds).toBeGreaterThanOrEqual(110);
      expect(r.status).toBe("ok");
      r = await healthReport(db, new Date(Date.now() + 3_600_000));
      expect(r.queue.ok).toBe(false); // nothing picked the jobs up for an hour

      const jobs = await boss.fetch<{ storeId: string }>("shopify.incremental", { batchSize: 2 });
      for (const j of jobs) await boss.fail("shopify.incremental", j.id, { message: `Shopify said no for ${j.data.storeId}`, stack: "secret stack" });

      const failed = await failedJobsFor(db, ["store-a"]);
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({ queue: "shopify.incremental", attempts: 1, error: "Shopify said no for store-a" });
      expect(await failedJobsFor(db, [])).toEqual([]);
      expect((await healthReport(db)).queue.failedLast24h).toBe(2);
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
