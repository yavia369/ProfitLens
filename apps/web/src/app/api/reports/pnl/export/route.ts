import { defaultGranularity } from "@profitlens/finance";
import { jsonError, reportContext } from "@/server/api";
import { storeComparisonFor } from "@/server/comparison";
import { comparisonTable, pnlTable, toPdf, toXlsx, type ExportTable } from "@/server/exports";
import { getAppSession } from "@/server/session";

const TYPES = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

/** P&L as an Excel workbook or a PDF (`format=xlsx|pdf`), by period (`view=period`) or by store (`view=stores`). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const format = sp.get("format");
  if (format !== "xlsx" && format !== "pdf") return jsonError(400, "format must be xlsx or pdf");
  let table: ExportTable;
  let name: string;
  if (sp.get("view") === "stores") {
    const session = await getAppSession();
    if (!session) return jsonError(401, "Not signed in");
    const r = await storeComparisonFor(session, sp);
    if ("error" in r) return jsonError(r.status, r.error);
    table = comparisonTable(r);
    name = `pnl_stores_${r.stores[0]!.range.start}_${r.stores[0]!.range.end}`;
  } else {
    const ctx = await reportContext(request);
    if (ctx instanceof Response) return ctx;
    const granularity = ctx.granularity ?? (defaultGranularity(ctx.range) === "day" ? "day" : "month");
    const r = await ctx.service.profitAndLoss(ctx.store.id, ctx.range, granularity);
    if (!r) return jsonError(404, "Store not found");
    table = pnlTable(r);
    name = `pnl_${r.range.start}_${r.range.end}_${r.granularity}`;
  }
  const body = format === "xlsx" ? await toXlsx(table) : await toPdf(table);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": TYPES[format], "Content-Disposition": `attachment; filename="${name}.${format}"`, "Cache-Control": "no-store" },
  });
}
