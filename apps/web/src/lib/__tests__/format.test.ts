import { describe, expect, it } from "vitest";
import { toCsv } from "../csv";
import { formatChange, formatMoney, formatPercent, formatRatio, plainAmount, signOf } from "../format";

describe("presentation formatting", () => {
  it("formats decimal strings exactly, without float artefacts", () => {
    expect(formatMoney("1234567.895", "AUD")).toBe("$1,234,567.90"); // half-even at display: .895 → .90
    expect(formatMoney("0.300000", "AUD")).toBe("$0.30");
    expect(formatMoney("99999999999999.99", "AUD")).toBe("$99,999,999,999,999.99"); // beyond float-safe precision
  });

  it("shows costs as accounting deductions", () => {
    expect(formatMoney("10450.77", "AUD", { asCost: true })).toBe("($10,450.77)");
    expect(formatMoney("0.000000", "AUD", { asCost: true })).toBe("$0.00");
    expect(formatMoney("-5.00", "AUD")).toBe("($5.00)");
  });

  it("renders null (undefined ratios) as an em dash, never 0", () => {
    expect(formatMoney(null, "AUD")).toBe("—");
    expect(formatPercent(null)).toBe("—");
    expect(formatRatio(null)).toBe("—");
    expect(formatChange(null)).toBe("—");
  });

  it("formats ratios and changes", () => {
    expect(formatPercent("0.584200")).toBe("58.4%");
    expect(formatRatio("3.701")).toBe("3.70×");
    expect(formatChange("0.1234")).toBe("+12.3%");
    expect(formatChange("-0.0240")).toBe("-2.4%");
  });

  it("reads signs without numeric conversion", () => {
    expect(signOf("-0.000001")).toBe(-1);
    expect(signOf("0.000000")).toBe(0);
    expect(signOf("12")).toBe(1);
    expect(signOf(null)).toBeNull();
  });
});

describe("plainAmount (form values)", () => {
  it("drops only trailing fractional zeros", () => {
    expect(plainAmount("12.500000")).toBe("12.5");
    expect(plainAmount("8.000000")).toBe("8");
    expect(plainAmount("100")).toBe("100");
    expect(plainAmount("0.000000")).toBe("0");
    expect(plainAmount(null)).toBe("");
  });
});

describe("CSV export", () => {
  it("escapes delimiters and neutralises formula injection while keeping negative numbers", () => {
    const csv = toCsv(["a", "b", "c"], [["x,y", "=HYPERLINK(\"evil\")", "-12.50"]]);
    expect(csv).toBe('a,b,c\r\n"x,y","\'=HYPERLINK(""evil"")",-12.50\r\n');
  });
});
