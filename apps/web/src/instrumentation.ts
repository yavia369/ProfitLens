import type { Instrumentation } from "next";

/**
 * Server error hook (PRODUCT_REQUIREMENTS §5 observability): every error Next.js captures in a page, route
 * handler, server action or the proxy is written as one JSON line with the request id, so the platform's log
 * drain can alert on it. When ERROR_REPORT_URL is set, a short report (no headers, cookies or bodies) is also
 * POSTed there, e.g. to an incident webhook. Stack traces stay in the logs only.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const header = request.headers["x-request-id"];
  const report = {
    level: "error",
    time: new Date().toISOString(),
    msg: "request failed",
    requestId: Array.isArray(header) ? header[0] : (header ?? null),
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null,
    error: err instanceof Error ? err.message : String(err),
    version: process.env.APP_VERSION ?? null,
  };
  console.error(JSON.stringify({ ...report, stack: err instanceof Error ? err.stack : undefined }));
  const url = process.env.ERROR_REPORT_URL;
  if (url) {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report), signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  }
};
