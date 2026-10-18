import { json, reportContext } from "@/server/api";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const rows = await ctx.source.listProducts(ctx.store.id, ctx.range);
  return json({ rows, range: ctx.range, currency: ctx.store.currency });
}
