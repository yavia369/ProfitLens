import { schema, type Database } from "@profitlens/db";
import { sql } from "drizzle-orm";

/** A worker is considered down when its last heartbeat is older than this (it beats every minute). */
export const WORKER_STALE_SECONDS = 300;
/** Queue lag above this (oldest due job not yet started) marks the system degraded. */
export const QUEUE_LAG_WARN_SECONDS = 900;
const PGBOSS_SCHEMA = "pgboss";

export async function recordWorkerHeartbeat(db: Database, worker: { id: string; startedAt: Date; version?: string | null }, now: Date = new Date()): Promise<void> {
  await db
    .insert(schema.workerHeartbeat)
    .values({ workerId: worker.id, startedAt: worker.startedAt, beatAt: now, version: worker.version ?? null })
    .onConflictDoUpdate({ target: schema.workerHeartbeat.workerId, set: { beatAt: now, startedAt: worker.startedAt, version: worker.version ?? null } });
}

/** Removes rows of worker processes gone for more than a day (each restart registers a new process id). */
export async function pruneWorkerHeartbeats(db: Database, now: Date = new Date()): Promise<void> {
  await db.execute(sql`delete from worker_heartbeat where beat_at < ${now.toISOString()}::timestamptz - interval '1 day'`);
}

export interface HealthReport {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  database: { ok: boolean; latencyMs: number | null };
  worker: { ok: boolean; lastBeatSecondsAgo: number | null };
  queue: { ok: boolean; lagSeconds: number | null; failedLast24h: number | null };
}

const rowsOf = <T>(r: unknown): T[] => (r as { rows: T[] }).rows;

async function pgbossReady(db: Database): Promise<boolean> {
  const [r] = rowsOf<{ ok: boolean }>(await db.execute(sql`select to_regclass(${`${PGBOSS_SCHEMA}.job`}) is not null as ok`));
  return r?.ok ?? false;
}

/**
 * System health without tenant data: database reachability, worker heartbeat age and queue lag (oldest due job
 * still waiting). "down" only when the database is unreachable; a missing worker or a lagging queue is "degraded".
 */
export async function healthReport(db: Database, now: Date = new Date()): Promise<HealthReport> {
  const checkedAt = now.toISOString();
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return { status: "down", checkedAt, database: { ok: false, latencyMs: null }, worker: { ok: false, lastBeatSecondsAgo: null }, queue: { ok: false, lagSeconds: null, failedLast24h: null } };
  }
  const latencyMs = Math.round(performance.now() - started);
  const [beat] = rowsOf<{ age: number | null }>(await db.execute(sql`select extract(epoch from (${now.toISOString()}::timestamptz - max(beat_at)))::int as age from worker_heartbeat`));
  const lastBeatSecondsAgo = beat?.age ?? null;
  const workerOk = lastBeatSecondsAgo !== null && lastBeatSecondsAgo <= WORKER_STALE_SECONDS;
  let lagSeconds: number | null = null;
  let failedLast24h: number | null = null;
  if (await pgbossReady(db)) {
    const [q] = rowsOf<{ lag: number | null; failed: number }>(
      await db.execute(sql`
        select
          (select extract(epoch from (${now.toISOString()}::timestamptz - min(start_after)))::int from pgboss.job where state in ('created', 'retry') and start_after <= ${now.toISOString()}::timestamptz) as lag,
          (select count(*)::int from pgboss.job where state = 'failed' and completed_on > ${now.toISOString()}::timestamptz - interval '24 hours') as failed`),
    );
    lagSeconds = Math.max(0, q?.lag ?? 0);
    failedLast24h = q?.failed ?? 0;
  }
  const queueOk = lagSeconds !== null && lagSeconds <= QUEUE_LAG_WARN_SECONDS;
  return {
    status: workerOk && queueOk ? "ok" : "degraded",
    checkedAt,
    database: { ok: true, latencyMs },
    worker: { ok: workerOk, lastBeatSecondsAgo },
    queue: { ok: queueOk, lagSeconds, failedLast24h },
  };
}

export interface FailedJob {
  readonly id: string;
  readonly queue: string;
  readonly failedAt: string | null;
  readonly attempts: number;
  readonly error: string | null;
}

/**
 * Background jobs for these stores (or payment connections / ad accounts belonging to them) that failed after all
 * retries in the last 7 days: the "dead letter" list shown in the Sync Center. Callers pass ids already
 * checked against the user's organization.
 */
export async function failedJobsFor(db: Database, ids: readonly string[], limit = 20): Promise<FailedJob[]> {
  if (!ids.length || !(await pgbossReady(db))) return [];
  const list = sql.join(
    ids.map((i) => sql`${i}`),
    sql`, `,
  );
  const rows = rowsOf<{ id: string; name: string; completed_on: Date | null; retry_count: number; output: unknown }>(
    await db.execute(sql`
      select id, name, completed_on, retry_count, output from pgboss.job
      where state = 'failed' and completed_on > now() - interval '7 days'
        and coalesce(data->>'storeId', data->>'connectionId', data->>'accountId') in (${list})
      order by completed_on desc limit ${limit}`),
  );
  return rows.map((r) => ({ id: r.id, queue: r.name, failedAt: r.completed_on ? new Date(r.completed_on).toISOString() : null, attempts: r.retry_count + 1, error: errorText(r.output) }));
}

/** pg-boss stores a failed handler's error as `{ message, stack }` (or a string); only the message is shown. */
function errorText(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string") return output.slice(0, 300);
  const message = (output as { message?: unknown }).message;
  return typeof message === "string" ? message.slice(0, 300) : null;
}
