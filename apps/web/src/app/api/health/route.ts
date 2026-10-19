import { healthReport } from "@profitlens/core/ops";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Health check (no tenant data). Default: 200 while the database answers, so a platform health check restarts the
 * web process only when it cannot serve; the body reports worker and queue state. `?strict=1` (uptime monitors)
 * also returns 503 when the worker is down or the queue lags.
 */
export async function GET(request: Request) {
  const report = await healthReport(db()).catch(() => null);
  const strict = new URL(request.url).searchParams.get("strict") === "1";
  const status = !report || report.status === "down" || (strict && report.status !== "ok") ? 503 : 200;
  return Response.json(report ?? { status: "down" }, { status, headers: { "Cache-Control": "no-store" } });
}
