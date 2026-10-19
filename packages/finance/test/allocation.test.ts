import { describe, expect, it } from "vitest";
import { allocateByShare, dec, sum } from "../src/index";

describe("ad spend allocation by share", () => {
  it("splits exactly, largest remainder first, ties to the earlier item", () => {
    const parts = allocateByShare(dec("100"), [
      { key: "a", base: dec("1") },
      { key: "b", base: dec("1") },
      { key: "c", base: dec("1") },
    ], 2);
    expect([...parts.values()].map((d) => d.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sum(parts.values()).toFixed(2)).toBe("100.00");
  });

  it("gives nothing to items with no or negative base and sums to the total at 6 dp", () => {
    const parts = allocateByShare(dec("31041.753337"), [
      { key: "x", base: dec("1200.50") },
      { key: "returns-only", base: dec("-80") },
      { key: "y", base: dec("399.95") },
      { key: "z", base: dec("0") },
    ]);
    expect(parts.get("returns-only")!.isZero()).toBe(true);
    expect(parts.get("z")!.isZero()).toBe(true);
    expect(sum(parts.values()).toFixed(6)).toBe("31041.753337");
    expect(parts.get("x")!.gt(parts.get("y")!)).toBe(true);
  });

  it("allocates nothing without a positive base or a total", () => {
    expect([...allocateByShare(dec("50"), [{ key: 1, base: dec("0") }]).values()].every((d) => d.isZero())).toBe(true);
    expect([...allocateByShare(dec("0"), [{ key: 1, base: dec("5") }]).values()].every((d) => d.isZero())).toBe(true);
  });

  it("keeps the sign of a negative total (a net refund of ad spend)", () => {
    const parts = allocateByShare(dec("-10"), [{ key: "a", base: dec("3") }, { key: "b", base: dec("1") }], 2);
    expect(parts.get("a")!.toFixed(2)).toBe("-7.50");
    expect(sum(parts.values()).toFixed(2)).toBe("-10.00");
  });
});
