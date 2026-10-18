import { defaultGranularity } from "@profitlens/finance";
import { json, jsonError, reportContext } from "@/server/api";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const granularity = ctx.granularity ?? (defaultGranularity(ctx.range) === "day" ? "day" : "month");
  const report = await ctx.service.profitAndLoss(ctx.store.id, ctx.range, granularity);
  return report ? json(report) : jsonError(404, "Store not found");
}
