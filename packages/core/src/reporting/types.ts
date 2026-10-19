import type { CampaignSpendRow, CustomerActivityRow, DailyComponents, DateRange, FxRateRow, LocalDate, MoneyString, UtmRow } from "@profitlens/finance";

export type CostStatus = "actual" | "rule" | "manual" | "estimated" | "missing";

export interface StoreSummary {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  /** Demo stores contain generated sample data and must always be bannered in the UI. */
  readonly isDemo: boolean;
  readonly lastSyncedAt: string | null; // ISO instant
}

export interface AdChannelSpend {
  readonly channel: string; // "google_ads" | "meta" | ...
  readonly label: string;
  readonly source: "api" | "manual";
  readonly spend: MoneyString;
  /** Platform-reported conversion value; null when the channel does not report it. */
  readonly platformConversionValue: MoneyString | null;
  /** Platform-reported ROAS = conversion value ÷ spend; null when not reported or no spend. */
  readonly platformRoas: string | null;
  /** The ad account's time zone differs from the store's: its days are mapped date-to-date (FINANCIAL_MODEL §1). */
  readonly timezoneApproximation?: boolean;
}

export interface OrderRow {
  readonly id: string;
  readonly name: string;
  readonly processedAt: string; // ISO instant
  readonly localDate: string;
  readonly financialStatus: string;
  readonly fulfillmentStatus: string;
  readonly itemsCount: number;
  readonly grossSales: MoneyString;
  readonly discounts: MoneyString;
  readonly returns: MoneyString;
  readonly revenue: MoneyString;
  readonly cogs: MoneyString;
  readonly shippingCost: MoneyString;
  readonly transactionFees: MoneyString;
  readonly profit: MoneyString; // contribution before ads (order level)
  /** profit ÷ revenue; null when revenue is zero. */
  readonly margin: string | null;
  readonly isComplete: boolean;
}

export interface BreakdownLine {
  readonly key: string;
  readonly label: string;
  readonly amount: MoneyString; // signed: revenue positive, costs negative
  readonly status: CostStatus | null;
  readonly source: string; // human-readable provenance
  readonly date?: string; // event local date when it differs from the order date
}

export interface OrderDetail extends OrderRow {
  readonly lineItems: readonly {
    readonly title: string;
    readonly variantTitle: string;
    readonly sku: string;
    readonly quantity: number;
    readonly unitPrice: MoneyString;
    readonly unitCost: MoneyString | null;
    readonly costStatus: CostStatus;
  }[];
  readonly breakdown: readonly BreakdownLine[];
  readonly memo: { readonly taxes: MoneyString; readonly giftCardSales: MoneyString };
}

export type OrderSortKey = "processedAt" | "revenue" | "profit" | "margin";

export interface OrderQuery {
  readonly range: DateRange;
  readonly search?: string;
  readonly sort?: OrderSortKey;
  readonly direction?: "asc" | "desc";
  readonly page?: number; // 1-based
  readonly pageSize?: number;
}

export interface ProductRow {
  readonly variantId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku: string;
  readonly unitsSold: number;
  readonly grossSales: MoneyString;
  readonly discounts: MoneyString;
  readonly returns: MoneyString;
  readonly netSales: MoneyString;
  readonly cogs: MoneyString;
  readonly grossProfit: MoneyString;
  /** gross profit ÷ net sales; null when net sales are zero. */
  readonly grossMargin: string | null;
  readonly costStatus: CostStatus;
}

/** One product's sales on one store-local day (event-dated, like the product report). */
export interface ProductDailyRow {
  readonly date: LocalDate;
  readonly unitsSold: number;
  readonly netSales: MoneyString;
  readonly cogs: MoneyString;
}

export interface CustomerActivity {
  readonly rows: readonly CustomerActivityRow[];
  /** Earliest stored order date. */
  readonly historyStart: LocalDate | null;
  /** All of the store's orders are stored (false e.g. without Shopify's read_all_orders: only 60 days). */
  readonly historyComplete: boolean;
}

/** Read-side data access for reports. Implemented by the demo adapter now, the database later. */
export interface ReportingDataSource {
  getStore(storeId: string): Promise<StoreSummary | null>;
  listStores(): Promise<StoreSummary[]>;
  /** One row per day in range (zero-filled). */
  getDailyComponents(storeId: string, range: DateRange): Promise<DailyComponents[]>;
  getAdSpendByChannel(storeId: string, range: DateRange): Promise<AdChannelSpend[]>;
  listOrders(storeId: string, query: OrderQuery): Promise<{ rows: OrderRow[]; total: number }>;
  getOrder(storeId: string, orderId: string): Promise<OrderDetail | null>;
  listProducts(storeId: string, range: DateRange): Promise<ProductRow[]>;
  /** Per-day sales of one product (all its variants) in the range; days without sales are omitted. */
  getProductDaily(storeId: string, productId: string, range: DateRange): Promise<ProductDailyRow[]>;
  /**
   * Per customer and store-local day, from the start of stored history through `end` (orders excluded by policy
   * are left out). When the history is incomplete (`historyComplete` false), customers who first ordered before
   * `historyStart` look new.
   */
  getCustomerActivity(storeId: string, end: LocalDate): Promise<CustomerActivity>;
  /** Spend per campaign (or per account where there are no campaigns) in store currency, with the same double-counting rules as the totals. */
  getCampaignSpend(storeId: string, range: DateRange): Promise<CampaignSpendRow[]>;
  /** Event-dated revenue and order profit in the range grouped by the orders' last-visit UTM parameters. */
  getUtmPerformance(storeId: string, range: DateRange): Promise<UtmRow[]>;
  /** Stored exchange rates touching `currencies` from 7 days before the range to its end (for fxConverter). */
  getFxRates(currencies: readonly string[], range: DateRange): Promise<FxRateRow[]>;
}
