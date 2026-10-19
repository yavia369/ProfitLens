import type { Decimal, MoneyString } from "../money";
import type { LocalDate } from "../dates";

/** Bump on any change to calculation semantics (FINANCIAL_MODEL header); stored with every result. */
export const ENGINE_VERSION = "1.1.0";

export type CostStatus = "actual" | "rule" | "manual" | "estimated" | "missing";

/** Worst-first order used when combining statuses (a single missing input makes the component missing). */
const STATUS_RANK: Record<CostStatus, number> = { missing: 4, estimated: 3, rule: 2, manual: 1, actual: 0 };

export function worstStatus(statuses: Iterable<CostStatus>, fallback: CostStatus = "actual"): CostStatus {
  let worst: CostStatus | null = null;
  for (const s of statuses) if (worst === null || STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  return worst ?? fallback;
}

// ---------------------------------------------------------------- inputs (plain data, JSON-hashable)

export interface EngineSale {
  readonly gid: string;
  readonly agreementType: string; // OrderAgreement | OrderEditAgreement | RefundAgreement | ReturnAgreement
  readonly refundGid: string | null;
  readonly happenedLocalDate: LocalDate;
  readonly actionType: "ORDER" | "RETURN" | "UPDATE" | "UNKNOWN";
  readonly lineType: "PRODUCT" | "SHIPPING" | "TIP" | "GIFT_CARD" | "DUTY" | "FEE" | "ADDITIONAL_FEE" | "ADJUSTMENT" | "UNKNOWN";
  readonly lineItemGid: string | null;
  /** Signed as Shopify reports it (returns and removals are negative). */
  readonly quantity: number | null;
  /** After discounts and taxes (shop money). */
  readonly totalAmount: MoneyString;
  readonly discountBeforeTaxes: MoneyString;
  readonly taxAmount: MoneyString;
}

export interface EngineLine {
  readonly gid: string;
  readonly variantId: string | null;
  readonly title: string;
  readonly quantity: number;
  readonly isGiftCard: boolean;
  readonly requiresShipping: boolean;
  /** Unit weight in grams (the variant's current weight). Only loaded when a weight-based shipping rule exists; null = unknown. */
  readonly weightGrams?: number | null;
}

export interface EngineRefund {
  readonly gid: string;
  readonly localDate: LocalDate;
  readonly lines: readonly {
    readonly lineItemGid: string;
    readonly quantity: number;
    readonly restockType: "RETURN" | "CANCEL" | "NO_RESTOCK" | "LEGACY_RESTOCK";
    readonly restocked: boolean;
  }[];
}

export interface EngineTransaction {
  readonly gid: string;
  readonly parentGid: string | null;
  readonly kind: string;
  readonly status: string;
  readonly gateway: string | null;
  readonly manual: boolean;
  readonly amount: MoneyString;
  readonly localDate: LocalDate | null;
  /** Σ Shopify-reported fee amounts, or a matched gateway fee (see feeSource); null when no fee data. */
  readonly feeAmount: MoneyString | null;
  readonly feeTaxAmount: MoneyString | null;
  /**
   * Set when feeAmount comes from the payment gateway itself (a PayPal/Stripe record matched to this payment,
   * D-052) rather than from Shopify. Shopify's third-party transaction fee is then still added.
   */
  readonly feeSource?: string;
}

export interface EngineDispute {
  readonly gid: string;
  readonly type: string; // CHARGEBACK | INQUIRY
  readonly status: string; // NEEDS_RESPONSE | UNDER_REVIEW | WON | LOST | ACCEPTED | CHARGE_REFUNDED
  readonly amount: MoneyString;
  readonly fee: MoneyString | null;
  readonly finalizedOn: LocalDate | null;
}

export interface OrderInput {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  /** Processed date in the store timezone: the "order date" for cost lookups. */
  readonly localDate: LocalDate;
  readonly test: boolean;
  readonly financialStatus: string | null;
  readonly cancelled: boolean;
  /** At least one fulfillment exists (used for "cancelled before fulfilment"). */
  readonly fulfilled: boolean;
  readonly shippingCountryCode: string | null;
  readonly lines: readonly EngineLine[];
  readonly sales: readonly EngineSale[];
  readonly refunds: readonly EngineRefund[];
  readonly transactions: readonly EngineTransaction[];
  readonly disputes: readonly EngineDispute[];
}

/** Effective-dated landed cost version: [from, to), `to` null = open-ended. */
export interface UnitCostVersion {
  readonly id: string;
  readonly from: LocalDate;
  readonly to: LocalDate | null;
  /** product cost + inbound shipping + handling per unit, store currency. */
  readonly landed: MoneyString;
  readonly source: string; // shopify_sync | manual | csv_import | supplier | bulk_edit
}

interface EffectiveDated {
  readonly id: string;
  readonly effectiveFrom: LocalDate;
  readonly effectiveTo: LocalDate | null;
  readonly currency: string;
}

export type ShippingRuleParams =
  | { readonly type: "per_order"; readonly amount: MoneyString }
  | { readonly type: "per_item"; readonly amount: MoneyString }
  | { readonly type: "first_plus_additional"; readonly first: MoneyString; readonly additional: MoneyString }
  | { readonly type: "tiered_quantity"; readonly tiers: readonly { readonly minQuantity: number; readonly amount: MoneyString }[] }
  | { readonly type: "tiered_weight"; readonly tiers: readonly { readonly minGrams: number; readonly amount: MoneyString }[] };

export interface ShippingRuleInput extends EffectiveDated {
  readonly name: string;
  readonly countryCodes: readonly string[] | null;
  readonly priority: number;
  readonly params: ShippingRuleParams;
}

export interface HandlingRuleInput extends EffectiveDated {
  readonly mode: "per_order" | "per_item";
  readonly amount: MoneyString;
}

export interface GatewayRuleInput extends EffectiveDated {
  readonly gateway: string;
  readonly percentRate: MoneyString; // 2.9 = 2.9 %
  readonly fixedFee: MoneyString;
  readonly thirdPartyFeeApplies: boolean;
}

export interface CostOverrideInput {
  readonly id: string;
  readonly component: "cogs" | "shipping" | "handling" | "transaction_fees";
  readonly amount: MoneyString;
}

/** Everything besides the order itself that the calculation depends on. */
export interface OrderCostContext {
  readonly storeCurrency: string;
  /** Shopify's fee on third-party gateways, percent (2 = 2 %); null when unknown. */
  readonly thirdPartyFeeRate: MoneyString | null;
  /** Cost versions for the variants of this order. */
  readonly unitCosts: Readonly<Record<string, readonly UnitCostVersion[]>>;
  readonly shippingRules: readonly ShippingRuleInput[];
  readonly handlingRules: readonly HandlingRuleInput[];
  readonly gatewayRules: readonly GatewayRuleInput[];
  /** Active (not superseded) overrides of this order, latest per component wins. */
  readonly overrides: readonly CostOverrideInput[];
}

// ---------------------------------------------------------------- outputs

export const ORDER_MONEY_PARTS = [
  "grossSales",
  "discounts",
  "returns",
  "shippingCharged",
  "tips",
  "adjustments",
  "dutiesAndFees",
  "taxes",
  "giftCardSales",
  "revenue",
  "cogs",
  "shippingCost",
  "handlingCost",
  "transactionFees",
  "chargebackLoss",
  "chargebackFees",
  "revenueMissingCogs",
  "feesEstimatedAmount",
  "unclassifiedSalesAmount",
] as const;

export const ORDER_COUNT_PARTS = ["ordersCount", "unitsSold", "ordersMissingCogs", "ordersMissingShipping", "transactionsMissingFees"] as const;

export type OrderMoneyPart = (typeof ORDER_MONEY_PARTS)[number];
export type OrderCountPart = (typeof ORDER_COUNT_PARTS)[number];
export type DayParts = Record<OrderMoneyPart, Decimal> & Record<OrderCountPart, number>;

/** COGS booked for one line on one day (negative for reversals). Feeds the product report. */
export interface CogsLine {
  readonly localDate: LocalDate;
  readonly lineItemGid: string | null;
  readonly variantId: string | null;
  readonly kind: "sale" | "reversal" | "override";
  readonly quantity: number; // signed
  readonly unitCost: Decimal | null;
  readonly amount: Decimal; // signed
  readonly status: CostStatus;
  readonly costVersionId: string | null;
}

export interface ComponentResult {
  readonly amount: Decimal;
  /** null = not applicable (e.g. no handling configured). */
  readonly status: CostStatus | null;
  readonly source: string;
}

export interface OrderProfitResult {
  readonly orderId: string;
  readonly included: boolean;
  readonly exclusionReason: string | null;
  /** Per store-local day contributions; Σ days = lifetime totals (FINANCIAL_MODEL §8). */
  readonly days: readonly { readonly localDate: LocalDate; readonly parts: DayParts }[];
  readonly totals: DayParts;
  readonly cogsLines: readonly CogsLine[];
  readonly components: {
    readonly cogs: ComponentResult;
    readonly shipping: ComponentResult;
    readonly handling: ComponentResult;
    readonly fees: ComponentResult;
    readonly chargebacks: ComponentResult;
  };
  /** Revenue − COGS − shipping − handling − fees − chargebacks (store-level expenses are applied daily). */
  readonly contributionBeforeAds: Decimal;
  readonly margin: Decimal | null;
  readonly completeness: { readonly complete: boolean; readonly missing: readonly string[]; readonly estimated: readonly string[] };
  /** JSON-serialisable explanation of every figure (stored in order_profit.trace). */
  readonly trace: Record<string, unknown>;
}
