import type { ComponentTotals } from "./components";
import { METRICS } from "./metrics";
import { Decimal, ZERO } from "./money";

export interface BridgeStep {
  readonly key: string;
  readonly label: string;
  /** Effect on net profit (positive = raised profit). */
  readonly effect: Decimal;
  readonly description: string;
}

export interface ProfitBridge {
  readonly start: Decimal; // previous net profit
  readonly end: Decimal; // current net profit
  readonly steps: readonly BridgeStep[];
}

/**
 * Profit variance bridge (PRODUCT_REQUIREMENTS M2): explains the change in net profit between two periods.
 * Revenue is split into an order-volume effect, (O₁ − O₀) × AOV₀, and an order-value effect, O₁ × (AOV₁ − AOV₀);
 * each cost line contributes −Δcost. The steps sum exactly to end − start (no rounding until display).
 */
export function profitBridge(current: ComponentTotals, previous: ComponentTotals): ProfitBridge {
  const net = (t: ComponentTotals) => METRICS.netProfit.compute(t)!;
  const o0 = new Decimal(previous.ordersCount);
  const o1 = new Decimal(current.ordersCount);
  const aov0 = o0.isZero() ? null : previous.revenue.div(o0);
  const aov1 = o1.isZero() ? null : current.revenue.div(o1);
  const dRevenue = current.revenue.minus(previous.revenue);
  // Without orders on one side the split is undefined: all of the revenue change is volume.
  const volume = aov0 && aov1 ? o1.minus(o0).times(aov0) : dRevenue;
  const value = dRevenue.minus(volume);

  const cost = (key: string, label: string, pick: (t: ComponentTotals) => Decimal, description: string): BridgeStep => ({
    key,
    label,
    effect: pick(previous).minus(pick(current)),
    description,
  });
  const steps: BridgeStep[] = [
    { key: "volume", label: "Order volume", effect: volume, description: `Change in orders (${previous.ordersCount} → ${current.ordersCount}) at the previous average order value` },
    { key: "orderValue", label: "Average order value", effect: value, description: "Change in revenue per order, on the current number of orders" },
    cost("cogs", "COGS", (t) => t.cogs, "Product costs"),
    cost("fulfilment", "Shipping & handling", (t) => t.shippingCost.plus(t.handlingCost), "What the store paid to ship and pack"),
    cost("fees", "Transaction fees", (t) => t.transactionFees, "Payment processing"),
    cost("chargebacks", "Chargebacks", (t) => t.chargebackLoss.plus(t.chargebackFees), "Lost disputes and fees"),
    cost("variableExpenses", "Per-order & % expenses", (t) => t.variableExpenses, "Custom variable expenses"),
    cost("adSpend", "Ad spend", (t) => t.adSpend.plus(t.adLinkedExpenses), "Advertising and ad-linked expenses"),
    cost("fixedExpenses", "Fixed expenses", (t) => t.fixedExpenses, "Recurring and one-time expenses"),
  ];
  return { start: net(previous), end: net(current), steps: steps.filter((s) => !s.effect.isZero() || s.key === "volume") };
}

/** Σ steps (for checks): equals end − start. */
export function bridgeTotal(b: ProfitBridge): Decimal {
  return b.steps.reduce((t, s) => t.plus(s.effect), ZERO);
}
