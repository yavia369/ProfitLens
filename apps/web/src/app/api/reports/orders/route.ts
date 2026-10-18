import { z } from "zod";
import { json, jsonError, reportContext } from "@/server/api";

const ordersQuery = z.object({
  search: z.string().max(100).optional(),
  sort: z.enum(["processedAt", "revenue", "profit", "margin"]).default("processedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const parsed = ordersQuery.safeParse(Object.fromEntries(ctx.searchParams));
  if (!parsed.success) return jsonError(400, "Invalid query", z.flattenError(parsed.error));
  const q = parsed.data;
  const result = await ctx.source.listOrders(ctx.store.id, { range: ctx.range, ...q, ...(q.search ? { search: q.search } : {}) });
  return json({ ...result, page: q.page, pageSize: q.pageSize, range: ctx.range, currency: ctx.store.currency });
}
