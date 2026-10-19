import { json, jsonError, reportContext } from "@/server/api";

/** Ad spend per campaign with platform-reported and UTM-modeled results, against the store's break-even ROAS. */
export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const report = await ctx.service.advertising(ctx.store.id, ctx.range);
  return report ? json(report) : jsonError(404, "Store not found");
}
