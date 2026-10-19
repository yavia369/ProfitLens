import type { LocalDate } from "../dates";
import { Decimal, dec, roundToMinor, ZERO } from "../money";
import type { GatewayRuleInput, HandlingRuleInput, ShippingRuleInput, ShippingRuleParams, UnitCostVersion } from "./types";

/** Effective-dated items use [from, to) in store-local dates, like cost versions. */
export function isEffective(item: { effectiveFrom: LocalDate; effectiveTo: LocalDate | null }, date: LocalDate): boolean {
  return item.effectiveFrom <= date && (item.effectiveTo === null || date < item.effectiveTo);
}

export function costVersionOn(versions: readonly UnitCostVersion[] | undefined, date: LocalDate): UnitCostVersion | null {
  return versions?.find((v) => v.from <= date && (v.to === null || date < v.to)) ?? null;
}

/**
 * Cost of one shipment of `units` shippable units weighing `weightGrams` in total under a rule's parameters.
 * Null when the rule needs the weight and it is unknown (never guessed).
 */
export function shippingRuleAmount(params: ShippingRuleParams, units: number, weightGrams: number | null = null): Decimal | null {
  if (units <= 0) return ZERO;
  switch (params.type) {
    case "per_order":
      return dec(params.amount);
    case "per_item":
      return dec(params.amount).times(units);
    case "first_plus_additional":
      return dec(params.first).plus(dec(params.additional).times(units - 1));
    case "tiered_quantity": {
      // The tier with the highest minimum quantity that the order reaches; below every tier → 0 is not
      // assumed, the lowest tier applies (a rule always prices a shipment it matches).
      const tiers = [...params.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
      const tier = [...tiers].reverse().find((t) => units >= t.minQuantity) ?? tiers[0];
      return tier ? dec(tier.amount) : ZERO;
    }
    case "tiered_weight": {
      // Same tier semantics by total shipment weight: the heaviest tier reached, else the lightest tier.
      if (weightGrams === null) return null;
      const tiers = [...params.tiers].sort((a, b) => a.minGrams - b.minGrams);
      const tier = [...tiers].reverse().find((t) => weightGrams >= t.minGrams) ?? tiers[0];
      return tier ? dec(tier.amount) : ZERO;
    }
  }
}

/**
 * The shipping rule that applies to an order: effective on the order date, in the store currency,
 * matching the destination (null/empty country list = all), lowest priority number first, then the most
 * recently effective rule.
 */
export function selectShippingRule(rules: readonly ShippingRuleInput[], date: LocalDate, country: string | null, currency: string): ShippingRuleInput | null {
  const matching = rules.filter(
    (r) => isEffective(r, date) && r.currency === currency && (!r.countryCodes || r.countryCodes.length === 0 || (country !== null && r.countryCodes.includes(country))),
  );
  matching.sort((a, b) => a.priority - b.priority || (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0));
  return matching[0] ?? null;
}

export function selectHandlingRule(rules: readonly HandlingRuleInput[], date: LocalDate, currency: string): HandlingRuleInput | null {
  const matching = rules.filter((r) => isEffective(r, date) && r.currency === currency);
  matching.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0));
  return matching[0] ?? null;
}

export function selectGatewayRule(rules: readonly GatewayRuleInput[], gateway: string, date: LocalDate, currency: string): GatewayRuleInput | null {
  const g = gateway.toLowerCase();
  return rules.find((r) => r.gateway.toLowerCase() === g && isEffective(r, date) && r.currency === currency) ?? null;
}

/** Percentage charge on an amount, rounded to minor units HALF_UP (processor convention, FINANCIAL_MODEL §2). */
export function percentCharge(amount: Decimal, percent: Decimal, currency: string): Decimal {
  return roundToMinor(amount.times(percent).div(100), currency, Decimal.ROUND_HALF_UP);
}
