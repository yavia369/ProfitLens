import "server-only";
import { ReportingService, type StoreComparisonReport } from "@profitlens/core";
import { DbReportingDataSource } from "@profitlens/core/profit";
import { DATE_PRESETS, isLocalDate, resolvePreset } from "@profitlens/finance";
import { schema } from "@profitlens/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import type { AppSession } from "./session";

export const comparisonQuerySchema = z
  .object({
    stores: z
      .string()
      .transform((v) => [...new Set(v.split(",").filter(Boolean))])
      .pipe(z.array(z.uuid()).min(2, "Choose at least two connected stores.").max(10)),
    preset: z.enum([...DATE_PRESETS, "custom"]).default("last_30_days"),
    start: z.string().refine(isLocalDate).optional(),
    end: z.string().refine(isLocalDate).optional(),
    /** Consolidation currency when the stores' currencies differ (default: the workspace's reporting currency). */
    currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").optional(),
  })
  .refine((q) => q.preset !== "custom" || (q.start && q.end && q.start <= q.end), { message: "custom range needs start <= end" });

/**
 * P&L for several connected stores of the caller's organization. The demo store cannot be compared with live
 * stores (demo data is never mixed with real data). Presets resolve in each store's own time zone.
 */
export async function storeComparisonFor(session: AppSession, params: URLSearchParams): Promise<StoreComparisonReport | { error: string; status: number }> {
  const parsed = comparisonQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid query", status: 400 };
  const q = parsed.data;
  const source = new DbReportingDataSource(db(), session.scope.organizationId);
  const stores = await source.listStores();
  const picked = q.stores.map((id) => stores.find((s) => s.id === id));
  if (picked.some((s) => !s)) return { error: "Store not found", status: 404 };
  const [org] = await db()
    .select({ currency: schema.organization.reportingCurrency })
    .from(schema.organization)
    .where(eq(schema.organization.id, session.scope.organizationId));
  const report = await new ReportingService(source).storeComparison(
    picked.map((s) => ({ storeId: s!.id, range: q.preset === "custom" ? { start: q.start!, end: q.end! } : resolvePreset(q.preset, s!.timezone) })),
    q.currency ?? org?.currency,
  );
  return report ?? { error: "Store not found", status: 404 };
}
