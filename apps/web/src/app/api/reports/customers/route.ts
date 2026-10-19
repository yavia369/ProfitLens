import { json, jsonError, reportContext } from "@/server/api";

const COHORT_MONTHS = new Set([6, 12, 24]);

/** Customer analytics for the range, with first-order-month cohorts (`cohorts=6|12|24`, default 12). */
export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const months = Number(ctx.searchParams.get("cohorts") ?? 12);
  if (!COHORT_MONTHS.has(months)) return jsonError(400, "cohorts must be 6, 12 or 24");
  const report = await ctx.service.customers(ctx.store.id, ctx.range, months);
  return report ? json(report) : jsonError(404, "Store not found");
}
