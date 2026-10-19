import { json, jsonError, reportContext } from "@/server/api";

/** One product over the range: totals, variants, daily series and its ad-spend share under each method. */
export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const ctx = await reportContext(request);
  if (ctx instanceof Response) return ctx;
  const { productId } = await params;
  if (productId.length > 128) return jsonError(400, "Invalid product");
  const report = await ctx.service.productDetail(ctx.store.id, productId, ctx.range);
  return report ? json(report) : jsonError(404, "No sales of this product in the range");
}
