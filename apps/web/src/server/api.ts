import "server-only";
import type { ReportingDataSource, ReportingService, StoreSummary } from "@profitlens/core";
import { COMPARISON_MODES, DATE_PRESETS, daysBetweenInclusive, isLocalDate, resolvePreset, type ComparisonMode, type DateRange, type Granularity } from "@profitlens/finance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { reportingFor } from "./reporting";
import { getAppSession, type AppSession } from "./session";

export const reportQuerySchema = z
  .object({
    store: z.string().min(1).max(64),
    preset: z.enum([...DATE_PRESETS, "custom"]).default("last_30_days"),
    start: z.string().refine(isLocalDate, "invalid date").optional(),
    end: z.string().refine(isLocalDate, "invalid date").optional(),
    compare: z.enum(COMPARISON_MODES).default("previous_period"),
    granularity: z.enum(["day", "week", "month"]).optional(),
  })
  .refine((q) => q.preset !== "custom" || (q.start && q.end && q.start <= q.end), { message: "custom range needs start <= end" })
  .refine((q) => q.preset !== "custom" || daysBetweenInclusive({ start: q.start!, end: q.end! }) <= 1100, { message: "range too long (max ~3 years)" });

export interface ReportContext {
  session: AppSession;
  store: StoreSummary;
  source: ReportingDataSource;
  service: ReportingService;
  range: DateRange;
  compare: ComparisonMode;
  granularity: Granularity | undefined;
  searchParams: URLSearchParams;
}

export function jsonError(status: number, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 409 for live stores whose profit calculation (phase 5) isn't available yet — never fake figures. */
export function engineNotReady(storeName: string): NextResponse {
  return NextResponse.json(
    { error: `${storeName}: data is imported, but profit calculations arrive in phase 5.`, code: "profit_engine_pending" },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

export function json<T>(body: T): NextResponse {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** Authenticates, validates the query, checks store access and resolves the date range in the store timezone. */
export async function reportContext(request: Request): Promise<ReportContext | NextResponse> {
  const session = await getAppSession();
  if (!session) return jsonError(401, "Not signed in");
  const searchParams = new URL(request.url).searchParams;
  const parsed = reportQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return jsonError(400, "Invalid query", z.flattenError(parsed.error));
  const q = parsed.data;
  const access = await reportingFor(session.scope, q.store);
  if (!access) return jsonError(404, "Store not found");
  if (access.kind === "engine_pending") return engineNotReady(access.store.name);
  const reporting = access;
  const store = await reporting.source.getStore(q.store);
  if (!store) return jsonError(404, "Store not found");
  const range = q.preset === "custom" ? { start: q.start!, end: q.end! } : resolvePreset(q.preset, store.timezone);
  return { session, store, source: reporting.source, service: reporting.service, range, compare: q.compare, granularity: q.granularity, searchParams };
}
