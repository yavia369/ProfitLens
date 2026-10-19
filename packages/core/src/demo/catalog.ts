/**
 * Fictional demo catalog (AUD). Two products intentionally have no cost configured so the UI's
 * missing-cost warnings can be demonstrated, and one product has an effective-dated cost change.
 */
export interface DemoCostVersion {
  readonly from: string; // inclusive local date
  readonly unitCost: string;
}

export interface DemoVariant {
  readonly id: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly price: string;
  /** Empty = cost missing. Versions sorted ascending by `from`. */
  readonly costs: readonly DemoCostVersion[];
  /** Relative popularity weight. */
  readonly weight: number;
  readonly isGiftCard?: boolean;
}

const v = (
  id: string,
  productTitle: string,
  variantTitle: string,
  sku: string,
  price: string,
  costs: DemoCostVersion[],
  weight: number,
  isGiftCard = false,
): DemoVariant => ({ id, productTitle, variantTitle, sku, price, costs, weight, isGiftCard });

export const DEMO_CATALOG: readonly DemoVariant[] = [
  v("demo-v-01", "Trail Runner Sneaker", "Black / 8", "TRS-BLK-08", "89.95", [{ from: "2025-01-01", unitCost: "31.20" }, { from: "2026-07-01", unitCost: "33.90" }], 9),
  v("demo-v-02", "Trail Runner Sneaker", "Black / 9", "TRS-BLK-09", "89.95", [{ from: "2025-01-01", unitCost: "31.20" }, { from: "2026-07-01", unitCost: "33.90" }], 8),
  v("demo-v-03", "Trail Runner Sneaker", "Grey / 8", "TRS-GRY-08", "89.95", [{ from: "2025-01-01", unitCost: "31.20" }, { from: "2026-07-01", unitCost: "33.90" }], 5),
  v("demo-v-04", "Everyday Linen Shirt", "S", "ELS-S", "59.00", [{ from: "2025-01-01", unitCost: "18.40" }], 5),
  v("demo-v-05", "Everyday Linen Shirt", "M", "ELS-M", "59.00", [{ from: "2025-01-01", unitCost: "18.40" }], 7),
  v("demo-v-06", "Everyday Linen Shirt", "L", "ELS-L", "59.00", [{ from: "2025-01-01", unitCost: "18.40" }], 5),
  v("demo-v-07", "Merino Crew Socks (3-pack)", "One size", "MCS-3PK", "24.95", [{ from: "2025-01-01", unitCost: "7.10" }], 10),
  v("demo-v-08", "Canvas Weekender Bag", "Olive", "CWB-OLV", "119.00", [{ from: "2025-01-01", unitCost: "44.00" }], 3),
  v("demo-v-09", "Classic Leather Belt", "Brown", "CLB-BRN", "49.00", [{ from: "2025-01-01", unitCost: "12.60" }], 4),
  v("demo-v-10", "Relaxed Chino", "32", "RCH-32", "79.00", [{ from: "2025-01-01", unitCost: "26.50" }], 6),
  v("demo-v-11", "Relaxed Chino", "34", "RCH-34", "79.00", [{ from: "2025-01-01", unitCost: "26.50" }], 4),
  v("demo-v-12", "Packable Rain Jacket", "Navy", "PRJ-NVY", "139.00", [], 3),
  v("demo-v-13", "Bamboo Tee (2-pack)", "White", "BTE-WHT", "39.00", [{ from: "2025-01-01", unitCost: "11.80" }], 7),
  v("demo-v-14", "Wool Beanie", "Charcoal", "WBN-CHR", "29.00", [], 4),
  v("demo-v-15", "Gift card", "$50", "GIFT-50", "50.00", [{ from: "2025-01-01", unitCost: "0" }], 0, true),
];

export const DEMO_STORE = {
  id: "demo",
  name: "Demo Store (sample data)",
  currency: "AUD",
  timezone: "Australia/Sydney",
  /** First day of generated history. */
  historyStart: "2025-01-01",
} as const;

/** Monthly fixed expenses (spread evenly across days). `marketing` ones count toward MER. */
export const DEMO_FIXED_EXPENSES = [
  { name: "Shopify plan", monthly: "59.00", marketing: false },
  { name: "Apps & software", monthly: "145.00", marketing: false },
  { name: "Virtual assistant", monthly: "900.00", marketing: false },
  { name: "Influencer retainer", monthly: "300.00", marketing: true },
] as const;

export const DEMO_RULES = {
  taxRatePercent: "10", // GST on top of prices (demo simplification: tax-exclusive pricing)
  shippingCharge: "9.95", // charged when net product sales < free-shipping threshold
  freeShippingThreshold: "100",
  shippingCostFirst: "7.50",
  shippingCostAdditional: "2.00",
  feePercent: "1.75",
  feeFixed: "0.30",
  packagingPerOrder: "1.20",
  chargebackFee: "25.00",
} as const;

/** Synthetic Google Ads campaigns: each takes a fixed share of the day's Google spend and of its platform value. */
export const DEMO_GOOGLE_CAMPAIGNS = [
  { id: "20431001", name: "Search - Brand", share: "0.22", valueShare: "0.31" },
  { id: "20431002", name: "Shopping - All products", share: "0.48", valueShare: "0.47" },
  { id: "20431003", name: "PMax - Prospecting", share: "0.30", valueShare: "0.22" },
] as const;

/** Stable id of a demo product (variants of one product share a title). */
export function demoProductId(productTitle: string): string {
  return `demo-p-${productTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
