/**
 * Report latency on the synthetic store from perf/seed.ts (PRODUCT_REQUIREMENTS §5: dashboard p95 < 1 s at 100k
 * orders). Runs every report the UI calls, through the same ReportingService/DbReportingDataSource as the web app,
 * over three ranges; prints p50/p95/max per report.
 *
 *   PERF_DATABASE_URL=postgres://…/profitlens_perf pnpm --filter @profitlens/core exec tsx perf/bench.ts [runs]
 */
import { createDb, createPool, schema } from "@profitlens/db";
import type { DateRange } from "@profitlens/finance";
import { ReportingService } from "../src/reporting/service";
import { DbReportingDataSource } from "../src/profit/reporting-source";

const url = process.env.PERF_DATABASE_URL;
if (!url || !/perf/.test(new URL(url).pathname)) throw new Error("PERF_DATABASE_URL must point at the *perf* database");
const RUNS = Number(process.argv[2] ?? 20);
const ONLY = process.argv[3]; // optional: substring of a report name
const pool = createPool(url, 10);
const db = createDb(pool);
const [st] = await db.select().from(schema.store);
if (!st) throw new Error("run perf/seed.ts first");
const source = new DbReportingDataSource(db, st.organizationId);
const service = new ReportingService(source);
const [anyProduct] = await db.select({ id: schema.product.id }).from(schema.product).limit(1);
const [anyOrder] = await db.select({ id: schema.order.id }).from(schema.order).limit(1);

const ranges: Record<string, DateRange> = {
  "30 days": { start: "2026-09-19", end: "2026-10-18" },
  "365 days": { start: "2025-10-19", end: "2026-10-18" },
  "730 days": { start: "2024-10-19", end: "2026-10-18" },
};
const reports: Record<string, (r: DateRange) => Promise<unknown>> = {
  dashboard: (r) => service.dashboard(st.id, r, "previous_period"),
  "P&L (month)": (r) => service.profitAndLoss(st.id, r, "month"),
  "orders page 1": (r) => source.listOrders(st.id, { range: r, page: 1, pageSize: 50 }),
  "orders search (number)": (r) => source.listOrders(st.id, { range: r, search: "#51234", page: 1, pageSize: 50 }),
  "orders search (SKU)": (r) => source.listOrders(st.id, { range: r, search: "SKU-77-2", page: 1, pageSize: 50 }),
  "order detail": () => source.getOrder(st.id, anyOrder!.id),
  products: (r) => service.products(st.id, r, null),
  "products + allocation": (r) => service.products(st.id, r, "revenue"),
  "product detail": (r) => service.productDetail(st.id, anyProduct!.id, r),
  customers: (r) => service.customers(st.id, r),
  advertising: (r) => service.advertising(st.id, r),
};

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]!;
const rows: { report: string; range: string; p50: number; p95: number; max: number }[] = [];
for (const [label, range] of Object.entries(ranges)) {
  for (const [name, run] of Object.entries(reports)) {
    if (ONLY && !name.includes(ONLY)) continue;
    await run(range); // warm-up (connections, plan cache)
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const t = performance.now();
      await run(range);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    rows.push({ report: name, range: label, p50: Math.round(pct(times, 50)), p95: Math.round(pct(times, 95)), max: Math.round(times.at(-1)!) });
  }
}
console.table(rows);
const slow = rows.filter((r) => r.p95 >= 1000);
console.log(slow.length ? `p95 ≥ 1 s: ${slow.map((r) => `${r.report} (${r.range}) ${r.p95} ms`).join(", ")}` : "all reports p95 < 1 s");
await pool.end();
