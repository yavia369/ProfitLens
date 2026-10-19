import { Decimal, dec, toMoneyString } from "@profitlens/finance";
import { GoogleAdsError } from "./errors";

/** Raw rows as returned by searchStream (int64 values are JSON strings; doubles are numbers; zero metrics may be omitted). */
export interface RawCustomerRow {
  customer: { id: string; descriptiveName?: string; currencyCode: string; timeZone: string; manager?: boolean; testAccount?: boolean };
}
export interface RawCustomerClientRow {
  customerClient: { id: string; descriptiveName?: string; currencyCode: string; timeZone: string; manager?: boolean; level?: string; status?: string; testAccount?: boolean };
}
export interface RawCampaignDailyRow {
  campaign: { id: string; name?: string; status?: string; advertisingChannelType?: string };
  segments: { date: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number; conversionsValue?: number };
}

export interface AdAccountFacts {
  readonly customerId: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly isManager: boolean;
  readonly isTest: boolean;
  /** Accounts that are cancelled/closed cannot be synced (customer_client.status). */
  readonly status: string;
}

export interface CampaignSpendFacts {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: string | null;
  readonly channelType: string | null;
  readonly date: string;
  /** Account currency, exact decimal string. */
  readonly spend: string;
  readonly impressions: bigint;
  readonly clicks: bigint;
  /** Platform-reported (Google returns doubles); memo only, never used for profit. */
  readonly conversions: string;
  readonly conversionValue: string;
}

const MICROS = new Decimal(1_000_000);

/** cost_micros (int64 as a decimal string) → currency units, exact. */
export function microsToAmount(micros: string | undefined): string {
  if (micros === undefined) return toMoneyString(new Decimal(0));
  if (!/^-?\d+$/.test(micros)) throw new GoogleAdsError(`unexpected micros value ${micros}`, "invalid");
  return toMoneyString(dec(micros).div(MICROS));
}

/** A JSON double rendered exactly as JavaScript prints it (the API gives no more precision than that). */
function doubleToDecimal(v: number | undefined): string {
  if (v === undefined) return toMoneyString(new Decimal(0));
  if (!Number.isFinite(v)) throw new GoogleAdsError(`unexpected metric value ${v}`, "invalid");
  return toMoneyString(new Decimal(v.toString()));
}

export function mapCustomer(row: RawCustomerRow): AdAccountFacts {
  const c = row.customer;
  return { customerId: c.id, name: c.descriptiveName || `Google Ads ${c.id}`, currency: c.currencyCode, timezone: c.timeZone, isManager: c.manager === true, isTest: c.testAccount === true, status: "ENABLED" };
}

export function mapCustomerClient(row: RawCustomerClientRow): AdAccountFacts {
  const c = row.customerClient;
  return {
    customerId: c.id,
    name: c.descriptiveName || `Google Ads ${c.id}`,
    currency: c.currencyCode,
    timezone: c.timeZone,
    isManager: c.manager === true,
    isTest: c.testAccount === true,
    status: c.status ?? "ENABLED",
  };
}

export function mapCampaignDaily(row: RawCampaignDailyRow): CampaignSpendFacts {
  const m = row.metrics ?? {};
  return {
    campaignId: row.campaign.id,
    campaignName: row.campaign.name ?? `Campaign ${row.campaign.id}`,
    campaignStatus: row.campaign.status ?? null,
    channelType: row.campaign.advertisingChannelType ?? null,
    date: row.segments.date,
    spend: microsToAmount(m.costMicros),
    impressions: BigInt(m.impressions ?? "0"),
    clicks: BigInt(m.clicks ?? "0"),
    conversions: doubleToDecimal(m.conversions),
    conversionValue: doubleToDecimal(m.conversionsValue),
  };
}
