import { describe, expect, it } from "vitest";
import { convertComponents, dailyComponents, fxConverter, hasMoney, type FxRateRow } from "../src/index";

// ECB-style: everything quoted against EUR.
const rows: FxRateRow[] = [
  { date: "2026-10-16", base: "EUR", quote: "AUD", rate: "1.6500" }, // Friday
  { date: "2026-10-16", base: "EUR", quote: "USD", rate: "1.1000" },
  { date: "2026-10-19", base: "EUR", quote: "AUD", rate: "1.6600" },
  { date: "2026-10-19", base: "EUR", quote: "USD", rate: "1.1200" },
  { date: "2026-10-19", base: "NZD", quote: "AUD", rate: "0.9000" },
];

describe("FX conversion", () => {
  it("uses direct, inverse and EUR-pivot rates on the same day", () => {
    const toAud = fxConverter(rows, "AUD");
    expect(toAud("AUD", "2026-10-19")!.toString()).toBe("1");
    expect(toAud("EUR", "2026-10-19")!.toString()).toBe("1.66"); // direct
    expect(toAud("NZD", "2026-10-19")!.toString()).toBe("0.9"); // direct pair
    expect(toAud("USD", "2026-10-19")!.toFixed(10)).toBe("1.4821428571"); // 1/1.12 × 1.66
    const toEur = fxConverter(rows, "EUR");
    expect(toEur("AUD", "2026-10-19")!.toFixed(10)).toBe("0.6024096386"); // inverse 1/1.66
  });

  it("borrows the latest earlier rate within 7 days (weekends), never further, never 1:1", () => {
    const toAud = fxConverter(rows, "AUD");
    expect(toAud("USD", "2026-10-18")!.toFixed(10)).toBe("1.5000000000"); // Sunday → Friday 1.65/1.10
    expect(toAud("USD", "2026-10-24")!.toFixed(10)).toBe("1.4821428571");
    expect(toAud("USD", "2026-10-27")).toBeNull(); // 8 days after the last rate
    expect(toAud("JPY", "2026-10-19")).toBeNull();
  });

  it("converts every money component of a day and keeps counts", () => {
    const day = dailyComponents("2026-10-19", { revenue: "100", cogs: "40.10", ordersCount: 3 });
    const c = convertComponents(day, fxConverter(rows, "AUD")("USD", "2026-10-19")!);
    expect(c.revenue).toBe("148.214286");
    expect(c.cogs).toBe("59.433929");
    expect(c.ordersCount).toBe(3);
    expect(hasMoney(day)).toBe(true);
    expect(hasMoney(dailyComponents("2026-10-19", { ordersCount: 1 }))).toBe(false);
  });
});
