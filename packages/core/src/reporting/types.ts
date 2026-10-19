import type { DailyComponents, DateRange, MoneyString } from "@profitlens/finance";

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
}
