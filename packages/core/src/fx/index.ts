import { schema, type Database } from "@profitlens/db";
import { addDays, type FxRateRow, type LocalDate } from "@profitlens/finance";
import { and, eq, max, sql } from "drizzle-orm";

/**
 * ECB euro foreign exchange reference rates (no key; published around 16:00 CET on TARGET business days).
 * VERIFIED 2026-10-19: XML `<Cube time="YYYY-MM-DD"><Cube currency="USD" rate="1.1253"/>…`, 1 EUR = rate; the
 * daily file uses single quotes with line breaks, the history files double quotes on one line.
 */
export const ECB_URLS = {
  last90Days: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
  history: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml",
} as const;
export const ECB_SOURCE = "ecb";

export type FetchText = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class FxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxImportError";
  }
}

/** Parses an ECB reference-rate XML file into EUR-based rows (either quote style, with or without line breaks). */
export function parseEcbXml(xml: string): FxRateRow[] {
  const rows: FxRateRow[] = [];
  const day = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const rate = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9]+(?:\.[0-9]+)?)["']\s*\/>/g;
  for (const d of xml.matchAll(day)) {
    for (const r of d[2]!.matchAll(rate)) rows.push({ date: d[1]!, base: "EUR", quote: r[1]!, rate: r[2]! });
  }
  if (rows.length === 0) throw new FxImportError("The ECB file contained no exchange rates (format changed?).");
  return rows;
}

/**
 * Imports ECB rates into `fx_rate` idempotently (re-imports overwrite the same day). The first import takes the
 * full history from `since` (default 3 years back, like ad spend); later imports read the 90-day file, which also
 * picks up any corrections. Returns what was stored.
 */
export async function importEcbRates(
  db: Database,
  fetchText: FetchText,
  opts: { today: LocalDate; since?: LocalDate; full?: boolean },
): Promise<{ rows: number; days: number; from: LocalDate | null; to: LocalDate | null; url: string }> {
  const [last] = await db.select({ d: max(schema.fxRate.date) }).from(schema.fxRate).where(eq(schema.fxRate.source, ECB_SOURCE));
  const since = opts.since ?? addDays(opts.today, -3 * 366);
  const needHistory = opts.full || !last?.d || last.d < addDays(opts.today, -80);
  const url = needHistory ? ECB_URLS.history : ECB_URLS.last90Days;
  const res = await fetchText(url);
  if (!res.ok) throw new FxImportError(`ECB returned HTTP ${res.status} for ${url}.`);
  const rows = parseEcbXml(await res.text()).filter((r) => r.date >= since && r.date <= opts.today);
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000).map((r) => ({ ...r, source: ECB_SOURCE }));
    await db
      .insert(schema.fxRate)
      .values(chunk)
      .onConflictDoUpdate({ target: [schema.fxRate.date, schema.fxRate.base, schema.fxRate.quote], set: { rate: sql`excluded.rate`, source: sql`excluded.source` } });
  }
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  return { rows: rows.length, days: dates.length, from: dates[0] ?? null, to: dates.at(-1) ?? null, url };
}

/** Latest stored ECB day (for status displays). */
export async function latestEcbDate(db: Database): Promise<LocalDate | null> {
  const [r] = await db.select({ d: max(schema.fxRate.date) }).from(schema.fxRate).where(and(eq(schema.fxRate.source, ECB_SOURCE), eq(schema.fxRate.base, "EUR")));
  return r?.d ?? null;
}
