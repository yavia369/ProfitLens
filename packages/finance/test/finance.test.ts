import { describe, expect, it } from "vitest";
import {
  addMonths,
  bridgeTotal,
  profitBridge,
  bucketKey,
  comparisonRange,
  completeness,
  computeMetrics,
  dailyComponents,
  dec,
  eachDay,
  METRIC_KEYS,
  METRICS,
  MoneySum,
  ratio,
  relativeChange,
  resolvePreset,
  roundToMinor,
  sum,
  sumComponents,
  todayIn,
  toMoneyString,
} from "../src/index";

describe("money", () => {
  it("MoneySum is exact: matches Decimal on mixed signs and scales, falls back for more than 6 decimals", () => {
    const values = ["0.1", "0.2", "-0.3", "123456789012.345678", "-0.000001", "7", "-12.5", "0.000000", "99999999999999.999999"];
    for (let i = 0; i < 200; i++) values.push(`${i % 3 ? "" : "-"}${(i * 7919) % 100000}.${String((i * 104729) % 1000000).padStart(6, "0")}`);
    const s = new MoneySum();
    for (const v of values) s.add(v);
    expect(s.value().toFixed(6)).toBe(sum(values.map(dec)).toFixed(6));
    const fine = new MoneySum().add("0.1234567").add("0.0000003"); // 7 decimals: Decimal fallback
    expect(fine.value().toFixed(7)).toBe("0.1234570");
    expect(new MoneySum().add(s).add(fine).value().toFixed(7)).toBe(sum([...values.map(dec), dec("0.123457")]).toFixed(7));
    expect(new MoneySum().add("0").isZero).toBe(true);
  });

  it("adds decimal strings exactly", () => {
    expect(toMoneyString(sum([dec("0.1"), dec("0.2")]), 2)).toBe("0.30");
    expect(toMoneyString(sum(Array.from({ length: 10 }, () => dec("0.1"))), 6)).toBe("1.000000");
  });

  it("rejects JS numbers and malformed strings", () => {
    expect(() => dec(0.1 as unknown as string)).toThrow(TypeError);
    expect(() => dec("1e3")).toThrow(TypeError);
    expect(() => dec("12,50")).toThrow(TypeError);
  });

  it("rounds half-even to currency minor units", () => {
    expect(roundToMinor(dec("2.345"), "AUD").toFixed(2)).toBe("2.34");
    expect(roundToMinor(dec("2.355"), "AUD").toFixed(2)).toBe("2.36");
    expect(roundToMinor(dec("1234.5"), "JPY").toFixed(0)).toBe("1234");
  });

  it("returns null for zero denominators", () => {
    expect(ratio(dec("5"), dec("0"))).toBeNull();
    expect(relativeChange(dec("5"), dec("0"))).toBeNull();
    expect(relativeChange(dec("-50"), dec("-100"))!.toFixed(2)).toBe("0.50"); // loss shrank: +50 %
  });
});

describe("metric registry", () => {
  const day = dailyComponents("2026-10-01", {
    grossSales: "1000",
    discounts: "100",
    returns: "50",
    shippingCharged: "40",
    tips: "10",
    taxes: "85",
    revenue: "900", // 1000 − 100 − 50 + 40 + 10
    cogs: "300",
    shippingCost: "60",
    handlingCost: "10",
    transactionFees: "30",
    chargebackLoss: "20",
    chargebackFees: "15",
    variableExpenses: "5",
    adSpend: "200",
    fixedExpenses: "50",
    marketingExpenses: "25",
    ordersCount: 10,
    unitsSold: 25,
    newCustomers: 8,
  });

  const m = computeMetrics(sumComponents([day]));

  it("derives profit chain per FINANCIAL_MODEL §6", () => {
    expect(m.netSales!.toFixed(2)).toBe("850.00");
    expect(m.grossProfit!.toFixed(2)).toBe("600.00");
    // 900 − (300 + 60 + 10 + 30 + 35 + 5) = 460
    expect(m.contributionBeforeAds!.toFixed(2)).toBe("460.00");
    expect(m.contributionAfterAds!.toFixed(2)).toBe("260.00");
    expect(m.netProfit!.toFixed(2)).toBe("210.00");
    expect(m.totalCosts!.toFixed(2)).toBe("690.00");
    expect(m.revenue!.minus(m.totalCosts!).toFixed(2)).toBe(m.netProfit!.toFixed(2));
  });

  it("computes ratios from unrounded totals", () => {
    expect(m.netMargin!.toFixed(6)).toBe("0.233333");
    expect(m.aov!.toFixed(2)).toBe("90.00");
    expect(m.roas!.toFixed(2)).toBe("4.50");
    expect(m.mer!.toFixed(2)).toBe("4.00");
    expect(m.breakEvenRoas!.toFixed(4)).toBe("1.9565"); // 900 / 460
    expect(m.breakEvenCpa!.toFixed(2)).toBe("46.00");
    expect(m.cac!.toFixed(2)).toBe("25.00");
    expect(m.refundRate!.toFixed(2)).toBe("0.05");
  });

  it("returns null (not 0) when there is no ad spend or no orders", () => {
    const empty = computeMetrics(sumComponents([dailyComponents("2026-10-02")]));
    expect(empty.roas).toBeNull();
    expect(empty.aov).toBeNull();
    expect(empty.netMargin).toBeNull();
    expect(empty.breakEvenRoas).toBeNull();
    expect(empty.netProfit!.toFixed(2)).toBe("0.00");
  });

  it("break-even ROAS is undefined when contribution before ads is not positive", () => {
    const loss = computeMetrics(sumComponents([dailyComponents("2026-10-03", { revenue: "100", cogs: "120", adSpend: "10", ordersCount: 1 })]));
    expect(loss.breakEvenRoas).toBeNull();
  });

  it("every metric has a label and formula", () => {
    for (const k of METRIC_KEYS) {
      expect(METRICS[k].label.length).toBeGreaterThan(0);
      expect(METRICS[k].formula.length).toBeGreaterThan(0);
    }
  });

  it("sums multiple days additively", () => {
    const totals = sumComponents([day, day]);
    expect(totals.revenue.toFixed(2)).toBe("1800.00");
    expect(totals.ordersCount).toBe(20);
    expect(computeMetrics(totals).netMargin!.toFixed(6)).toBe("0.233333");
  });
});

describe("completeness", () => {
  it("flags missing COGS with revenue share", () => {
    const t = sumComponents([dailyComponents("2026-10-01", { revenue: "200", revenueMissingCogs: "50", ordersMissingCogs: 1, ordersCount: 4 })]);
    const c = completeness(t);
    expect(c.complete).toBe(false);
    expect(c.revenueMissingCogsShare!.toFixed(2)).toBe("0.25");
  });

  it("is complete when no counters are set", () => {
    expect(completeness(sumComponents([dailyComponents("2026-10-01", { revenue: "10" })])).complete).toBe(true);
  });
});

describe("dates (store timezone)", () => {
  // 2026-10-18T13:30Z is already Oct 19 in Sydney (UTC+11 during AEDT) and still Oct 18 in New York.
  const now = new Date("2026-10-18T13:30:00Z");

  it("determines today in the store timezone, not the host timezone", () => {
    expect(todayIn("Australia/Sydney", now)).toBe("2026-10-19");
    expect(todayIn("America/New_York", now)).toBe("2026-10-18");
  });

  it("resolves presets", () => {
    const tz = "Australia/Sydney";
    expect(resolvePreset("today", tz, now)).toEqual({ start: "2026-10-19", end: "2026-10-19" });
    expect(resolvePreset("yesterday", tz, now)).toEqual({ start: "2026-10-18", end: "2026-10-18" });
    expect(resolvePreset("last_7_days", tz, now)).toEqual({ start: "2026-10-13", end: "2026-10-19" });
    expect(resolvePreset("last_30_days", tz, now)).toEqual({ start: "2026-09-20", end: "2026-10-19" });
    expect(resolvePreset("this_month", tz, now)).toEqual({ start: "2026-10-01", end: "2026-10-19" });
    expect(resolvePreset("last_month", tz, now)).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(resolvePreset("this_year", tz, now)).toEqual({ start: "2026-01-01", end: "2026-10-19" });
  });

  it("handles the DST change day (Sydney DST starts 2026-10-04)", () => {
    expect(todayIn("Australia/Sydney", new Date("2026-10-03T13:59:00Z"))).toBe("2026-10-03"); // 23:59 AEST
    expect(todayIn("Australia/Sydney", new Date("2026-10-03T14:00:00Z"))).toBe("2026-10-04"); // 00:00 AEST
    expect(todayIn("Australia/Sydney", new Date("2026-10-04T13:00:00Z"))).toBe("2026-10-05"); // 00:00 AEDT
  });

  it("computes comparison ranges", () => {
    const r = { start: "2026-10-13", end: "2026-10-19" };
    expect(comparisonRange(r, "previous_period")).toEqual({ start: "2026-10-06", end: "2026-10-12" });
    expect(comparisonRange({ start: "2026-03-31", end: "2026-03-31" }, "previous_month")).toEqual({ start: "2026-02-28", end: "2026-02-28" });
    expect(comparisonRange({ start: "2024-02-29", end: "2024-02-29" }, "previous_year")).toEqual({ start: "2023-02-28", end: "2023-02-28" });
    expect(comparisonRange(r, "none")).toBeNull();
  });

  it("enumerates days and buckets weeks (Monday start) and months", () => {
    expect(eachDay({ start: "2026-02-27", end: "2026-03-02" })).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(bucketKey("2026-10-18", "week")).toBe("2026-10-12"); // Sunday → previous Monday
    expect(bucketKey("2026-10-12", "week")).toBe("2026-10-12");
    expect(bucketKey("2026-10-18", "month")).toBe("2026-10-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("profit variance bridge", () => {
  const t = (v: Parameters<typeof dailyComponents>[1]) => sumComponents([dailyComponents("2026-10-01", v)]);
  it("splits revenue into volume and order value; steps sum exactly to the change in net profit", () => {
    const prev = t({ revenue: "1000", ordersCount: 10, cogs: "400", transactionFees: "30", adSpend: "200", fixedExpenses: "100" });
    const cur = t({ revenue: "1320", ordersCount: 12, cogs: "530", transactionFees: "40", adSpend: "260", fixedExpenses: "100" });
    const b = profitBridge(cur, prev);
    expect(b.start.toFixed(2)).toBe("270.00");
    expect(b.end.toFixed(2)).toBe("390.00");
    const step = (k: string) => b.steps.find((s) => s.key === k)?.effect.toFixed(2);
    expect(step("volume")).toBe("200.00"); // 2 more orders × 100 AOV
    expect(step("orderValue")).toBe("120.00"); // 12 × (110 − 100)
    expect(step("cogs")).toBe("-130.00");
    expect(step("fees")).toBe("-10.00");
    expect(step("adSpend")).toBe("-60.00");
    expect(step("fixedExpenses")).toBeUndefined(); // unchanged lines are omitted
    expect(bridgeTotal(b).eq(b.end.minus(b.start))).toBe(true);
  });

  it("puts the whole revenue change into volume when a period has no orders", () => {
    const b = profitBridge(t({ revenue: "500", ordersCount: 5 }), t({}));
    expect(b.steps.find((s) => s.key === "volume")!.effect.toFixed(2)).toBe("500.00");
    expect(b.steps.find((s) => s.key === "orderValue")).toBeUndefined();
    expect(bridgeTotal(b).eq(b.end.minus(b.start))).toBe(true);
  });

  it("stays exact with awkward averages (no rounding before display)", () => {
    const b = profitBridge(t({ revenue: "100", ordersCount: 3 }), t({ revenue: "100", ordersCount: 7 }));
    expect(bridgeTotal(b).eq(b.end.minus(b.start))).toBe(true);
  });
});
