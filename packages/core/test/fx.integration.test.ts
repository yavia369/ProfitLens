import { readFileSync } from "node:fs";
import { createDb, createPool, schema, type Database } from "@profitlens/db";
import { freshTestDatabase } from "@profitlens/db/testing";
import { fxConverter } from "@profitlens/finance";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ECB_URLS, FxImportError, importEcbRates, latestEcbDate, parseEcbXml, type FetchText } from "../src/fx";

const baseUrl = process.env.TEST_DATABASE_URL ?? "postgres://profitlens:profitlens@localhost:5432/profitlens_test";
// Real ECB files fetched on 2026-10-19 (the daily file and the first three days of the 90-day file).
const DAILY = readFileSync(new URL("./fixtures/ecb/daily.xml", import.meta.url), "utf8");
const HIST = readFileSync(new URL("./fixtures/ecb/hist-90d-sample.xml", import.meta.url), "utf8");
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  pool = createPool(await freshTestDatabase(baseUrl, "fx"), 2);
  db = createDb(pool);
});
afterAll(async () => {
  await pool?.end();
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE fx_rate`);
});

const fake = (body: string, status = 200) => {
  const calls: string[] = [];
  const f: FetchText = async (url) => {
    calls.push(url);
    return { ok: status === 200, status, text: async () => body };
  };
  return { f, calls };
};

describe("ECB reference rates", () => {
  it("parses both ECB file styles (single-quoted daily, double-quoted one-line history)", () => {
    const daily = parseEcbXml(DAILY);
    expect(daily.find((r) => r.quote === "AUD")).toEqual({ date: "2026-10-16", base: "EUR", quote: "AUD", rate: "1.6171" });
    expect(daily.find((r) => r.quote === "USD")!.rate).toBe("1.1253");
    const hist = parseEcbXml(HIST);
    expect([...new Set(hist.map((r) => r.date))]).toEqual(["2026-10-16", "2026-10-15", "2026-10-14"]);
    expect(hist.filter((r) => r.date === "2026-10-16")).toHaveLength(daily.length);
    expect(() => parseEcbXml("<html>maintenance</html>")).toThrow(FxImportError);
  });

  it("imports idempotently: history first, then the 90-day file; converts AUD↔USD through EUR", async () => {
    const first = fake(HIST);
    const r1 = await importEcbRates(db, first.f, { today: "2026-10-19" });
    expect(first.calls).toEqual([ECB_URLS.history]);
    expect(r1).toMatchObject({ days: 3, from: "2026-10-14", to: "2026-10-16" });
    const again = fake(HIST);
    await importEcbRates(db, again.f, { today: "2026-10-19" });
    expect(again.calls).toEqual([ECB_URLS.last90Days]);
    expect(await db.select().from(schema.fxRate)).toHaveLength(r1.rows); // re-import overwrote, no duplicates
    expect(await latestEcbDate(db)).toBe("2026-10-16");

    const rows = await db.select().from(schema.fxRate);
    const toAud = fxConverter(rows.map((r) => ({ date: r.date, base: r.base, quote: r.quote, rate: r.rate })), "AUD");
    // Monday 19 Oct has no rate yet: Friday's (1.6171 / 1.1253) is used.
    expect(toAud("USD", "2026-10-19")!.toFixed(6)).toBe("1.437039");
  });

  it("reports HTTP failures and stores nothing", async () => {
    await expect(importEcbRates(db, fake("", 503).f, { today: "2026-10-19" })).rejects.toThrow(/HTTP 503/);
    expect(await latestEcbDate(db)).toBeNull();
  });
});
