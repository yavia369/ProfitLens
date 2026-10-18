/** Calculation policy (FINANCIAL_MODEL §7). Versioned per store; these are the defaults. */
export interface FinancialPolicy {
  readonly includedFinancialStatuses: readonly string[];
  readonly tipsAsRevenue: boolean;
  readonly dutiesAndFeesAsRevenue: boolean;
  readonly refundDating: "event" | "order";
  readonly chargebackDating: "event" | "order";
  readonly cogsFallback: { readonly mode: "none" } | { readonly mode: "percent_of_price"; readonly percent: string };
  readonly cogsReversalRestockTypes: readonly ("RETURN" | "CANCEL" | "NO_RESTOCK" | "LEGACY_RESTOCK")[];
  readonly zeroShippingIfUnfulfilledCancel: boolean;
  readonly feeTaxRecoverable: boolean;
  readonly feesRefundedOnRefund: boolean;
  readonly defaultChargebackFee: string | null;
  readonly expenseAllocation: "spread" | "on_date";
}

export const DEFAULT_POLICY: FinancialPolicy = {
  includedFinancialStatuses: ["PENDING", "AUTHORIZED", "PARTIALLY_PAID", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
  tipsAsRevenue: true,
  dutiesAndFeesAsRevenue: false,
  refundDating: "event",
  chargebackDating: "event",
  cogsFallback: { mode: "none" },
  cogsReversalRestockTypes: ["RETURN", "CANCEL"],
  zeroShippingIfUnfulfilledCancel: true,
  feeTaxRecoverable: false,
  feesRefundedOnRefund: false,
  defaultChargebackFee: null,
  expenseAllocation: "spread",
};

/** Human-readable explanation of each policy setting (shown in settings). */
export const POLICY_DESCRIPTIONS: Record<keyof FinancialPolicy, { label: string; describe: (p: FinancialPolicy) => string }> = {
  includedFinancialStatuses: { label: "Orders included", describe: (p) => `Financial statuses: ${p.includedFinancialStatuses.map((s) => s.toLowerCase().replace(/_/g, " ")).join(", ")}. Test orders are always excluded.` },
  tipsAsRevenue: { label: "Tips", describe: (p) => (p.tipsAsRevenue ? "Counted as revenue." : "Excluded from revenue.") },
  dutiesAndFeesAsRevenue: { label: "Duties & checkout fees", describe: (p) => (p.dutiesAndFeesAsRevenue ? "Counted as revenue." : "Treated as pass-through (excluded from revenue, shown as a memo).") },
  refundDating: { label: "Refund date", describe: (p) => (p.refundDating === "event" ? "Refunds reduce revenue on the day they happen (matches Shopify's sales reports)." : "Refunds are restated onto the original order date.") },
  chargebackDating: { label: "Chargeback date", describe: (p) => (p.chargebackDating === "event" ? "Lost chargebacks are booked on their resolution date." : "Lost chargebacks are restated onto the original order date.") },
  cogsFallback: { label: "Missing product cost", describe: (p) => (p.cogsFallback.mode === "none" ? "Counted as zero and flagged as missing — profit is marked incomplete." : `Estimated at ${p.cogsFallback.percent}% of the selling price and labelled "estimated".`) },
  cogsReversalRestockTypes: { label: "Returns and COGS", describe: (p) => `Cost is reversed for returned items with restock type: ${p.cogsReversalRestockTypes.map((t) => t.toLowerCase().replace(/_/g, " ")).join(", ")}. Items not restocked keep their cost.` },
  zeroShippingIfUnfulfilledCancel: { label: "Cancelled before fulfilment", describe: (p) => (p.zeroShippingIfUnfulfilledCancel ? "No shipping cost is charged for orders cancelled before fulfilment." : "Shipping rules still apply to cancelled orders.") },
  feeTaxRecoverable: { label: "Tax on payment fees", describe: (p) => (p.feeTaxRecoverable ? "Excluded from fees (recoverable input tax, e.g. registered for GST)." : "Included in fee cost.") },
  feesRefundedOnRefund: { label: "Fees on refunds", describe: (p) => (p.feesRefundedOnRefund ? "Processing fees are returned when an order is refunded." : "Processing fees are kept by the processor when an order is refunded.") },
  defaultChargebackFee: { label: "Default chargeback fee", describe: (p) => (p.defaultChargebackFee ? `${p.defaultChargebackFee} when the actual dispute fee is unavailable.` : "None — chargeback fees without data are flagged as missing.") },
  expenseAllocation: { label: "Recurring expenses", describe: (p) => (p.expenseAllocation === "spread" ? "Spread evenly across the days of each period." : "Booked on each occurrence date.") },
};
