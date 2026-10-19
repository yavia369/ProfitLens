import { dec, toMoneyString } from "@profitlens/finance";
import { MetaAdsError } from "./errors";

/** `act_<id>` and numeric strings as Meta returns them; money as decimal strings in the account currency. */
export interface RawAdAccount {
  id: string;
  account_id: string;
  name?: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}
export interface RawActionStat {
  action_type: string;
  value: string;
}
export interface RawCampaignInsight {
  campaign_id: string;
  campaign_name?: string;
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: RawActionStat[];
  action_values?: RawActionStat[];
}

export const AD_ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status";
export const CAMPAIGN_INSIGHT_FIELDS = "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,date_start,date_stop";

/** account_status values from the v26 AdAccount reference. */
const ACCOUNT_STATUS: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
};
/** Statuses whose history can still be read (spend existed); closed/disabled accounts are listed but not synced. */
export const SYNCABLE_STATUSES = new Set(["ACTIVE", "UNSETTLED", "PENDING_RISK_REVIEW", "PENDING_SETTLEMENT", "IN_GRACE_PERIOD"]);

export interface MetaAccountFacts {
  readonly accountId: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly status: string;
}

export function mapAdAccount(a: RawAdAccount): MetaAccountFacts {
  if (!/^\d+$/.test(a.account_id) || !/^[A-Z]{3}$/.test(a.currency) || !a.timezone_name) throw new MetaAdsError(`unexpected ad account ${a.id}`, "invalid");
  return { accountId: a.account_id, name: a.name?.trim() || `act_${a.account_id}`, currency: a.currency, timezone: a.timezone_name, status: ACCOUNT_STATUS[a.account_status] ?? `STATUS_${a.account_status}` };
}

/**
 * Purchases as Meta reports them (platform attribution): `omni_purchase` (all channels) when present, else the
 * pixel purchase. The two overlap, so they are never added together.
 */
const PURCHASE_TYPES = ["omni_purchase", "offsite_conversion.fb_pixel_purchase"] as const;
function purchase(stats: RawActionStat[] | undefined): string {
  for (const t of PURCHASE_TYPES) {
    const s = stats?.find((x) => x.action_type === t);
    if (s) return toMoneyString(dec(s.value));
  }
  return toMoneyString(dec("0"));
}

export interface MetaCampaignDay {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly date: string;
  readonly spend: string;
  readonly impressions: bigint;
  readonly clicks: bigint;
  readonly conversions: string;
  readonly conversionValue: string;
}

export function mapCampaignInsight(r: RawCampaignInsight): MetaCampaignDay {
  if (r.date_start !== r.date_stop) throw new MetaAdsError(`expected a daily row, got ${r.date_start}..${r.date_stop}`, "invalid");
  if (!/^\d+$/.test(r.campaign_id)) throw new MetaAdsError(`unexpected campaign id ${r.campaign_id}`, "invalid");
  const int = (v: string | undefined) => {
    if (v === undefined) return 0n;
    if (!/^\d+$/.test(v)) throw new MetaAdsError(`unexpected count ${v}`, "invalid");
    return BigInt(v);
  };
  return {
    campaignId: r.campaign_id,
    campaignName: r.campaign_name ?? r.campaign_id,
    date: r.date_start,
    spend: toMoneyString(dec(r.spend ?? "0")),
    impressions: int(r.impressions),
    clicks: int(r.clicks),
    conversions: purchase(r.actions),
    conversionValue: purchase(r.action_values),
  };
}
