import { json, jsonError, reportContext } from "@/server/api";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const payload = await ctx.service.dashboard(ctx.store.id, ctx.range, ctx.compare, ctx.granularity);
  return payload ? json(payload) : jsonError(404, "Store not found");
}
