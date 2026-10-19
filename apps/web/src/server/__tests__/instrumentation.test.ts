import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "../../instrumentation";

const context = { routerKind: "App Router", routePath: "/api/reports/orders", routeType: "route", renderSource: "server-rendering", revalidateReason: undefined, renderType: "dynamic" } as const;

describe("server error hook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs one JSON line with the request id and posts a header-free report when ERROR_REPORT_URL is set", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => void lines.push(line));
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ERROR_REPORT_URL", "https://alerts.example/hook");
    const err = Object.assign(new Error("db timeout"), { digest: "123" });
    await onRequestError(err, { path: "/api/reports/orders?store=s1", method: "GET", headers: { "x-request-id": "req-12345678", cookie: "secret-session" } }, context);

    const logged = JSON.parse(lines[0]!);
    expect(logged).toMatchObject({ level: "error", requestId: "req-12345678", path: "/api/reports/orders", routeType: "route", digest: "123", error: "db timeout" });
    expect(lines[0]).not.toContain("secret-session");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://alerts.example/hook");
    expect(init.body).not.toContain("secret-session");
    expect(JSON.parse(init.body)).not.toHaveProperty("stack");
  });

  it("never throws when the report endpoint is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    vi.stubEnv("ERROR_REPORT_URL", "https://alerts.example/hook");
    await expect(onRequestError("plain failure", { path: "/", method: "GET", headers: {} }, context)).resolves.toBeUndefined();
  });
});
