import type { AdAllocationMethod } from "@profitlens/finance";
import { json, jsonError, reportContext } from "@/server/api";

const METHODS = new Set<string>(["revenue", "units"]);

/** Product report; `allocation=revenue|units` adds each variant's labelled share of store ad spend. */
export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const allocation = ctx.searchParams.get("allocation");
  if (allocation !== null && allocation !== "none" && !METHODS.has(allocation)) return jsonError(400, "allocation must be none, revenue or units");
  const method = allocation && METHODS.has(allocation) ? (allocation as AdAllocationMethod) : null;
  const report = await ctx.service.products(ctx.store.id, ctx.range, method);
  return report ? json(report) : jsonError(404, "Store not found");
}
