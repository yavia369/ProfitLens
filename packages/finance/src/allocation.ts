import { Decimal, ZERO } from "./money";

/** How store-level ad spend is spread over products. Every allocated figure is labelled as an estimate. */
export type AdAllocationMethod = "revenue" | "units";

export const AD_ALLOCATION_METHODS: Record<AdAllocationMethod, { readonly label: string; readonly description: string }> = {
  revenue: {
    label: "By share of net sales",
    description: "Each product carries ad spend in proportion to its net sales in the range (estimate, not attribution).",
  },
  units: {
    label: "By share of units sold",
    description: "Each product carries ad spend in proportion to the units it sold in the range (estimate, not attribution).",
  },
};

/**
 * Splits `total` over items in proportion to their positive `base` (items with a base ≤ 0 get nothing) with the
 * largest-remainder method at `scale` decimal places, so the parts always sum exactly to `total` (when `total`
 * has at most `scale` decimals). Ties go to the earlier item. With no positive base nothing is allocated.
 */
export function allocateByShare<K>(total: Decimal, items: readonly { key: K; base: Decimal }[], scale = 6): Map<K, Decimal> {
  const out = new Map<K, Decimal>(items.map((i) => [i.key, ZERO]));
  const eligible = items.filter((i) => i.base.gt(0));
  const baseSum = eligible.reduce((s, i) => s.plus(i.base), ZERO);
  if (eligible.length === 0 || total.isZero()) return out;
  const sign = total.isNegative() ? -1 : 1;
  const unit = new Decimal(1).div(new Decimal(10).pow(scale));
  const units = total.abs().div(unit).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const shares = eligible.map((i, idx) => {
    const exact = units.times(i.base).div(baseSum);
    const floor = exact.toDecimalPlaces(0, Decimal.ROUND_DOWN);
    return { key: i.key, idx, floor, rest: exact.minus(floor) };
  });
  let left = units.minus(shares.reduce((s, x) => s.plus(x.floor), ZERO)).toNumber(); // < eligible.length
  for (const x of [...shares].sort((a, b) => b.rest.comparedTo(a.rest) || a.idx - b.idx)) {
    if (left <= 0) break;
    x.floor = x.floor.plus(1);
    left--;
  }
  for (const x of shares) out.set(x.key, x.floor.times(unit).times(sign));
  return out;
}
