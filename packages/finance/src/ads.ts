import { dec, ratio, ZERO, type Decimal, type MoneyString } from "./money";

export type AdPlatformKey = "google_ads" | "meta" | "tiktok" | "manual";

/** Spend of one campaign over a range, in store currency (null when an exchange rate is missing). */
export interface CampaignSpendRow {
  readonly platform: AdPlatformKey;
  readonly accountName: string;
  /** Campaign external id; for accounts without campaigns (manual entries) the account id. */
  readonly campaignId: string;
  readonly campaignName: string;
  readonly source: "api" | "manual";
  /** False for account-level spend (manual entries, platforms without campaigns): nothing to match UTMs against. */
  readonly attributable: boolean;
  readonly spend: MoneyString | null;
  /** Platform-reported conversion value (the platform's own attribution model). */
  readonly platformValue: MoneyString | null;
  readonly clicks: number | null;
  /** The ad account's days are mapped date-to-date onto the store's time zone. */
  readonly otherTimezone: boolean;
}

/** Orders grouped by the UTM parameters of the visit that led to them, with event-dated money in the range. */
export interface UtmRow {
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  /** Orders placed in the range. */
  readonly orders: number;
  readonly revenue: MoneyString;
  /** Order profit before ads (revenue − COGS − fulfilment − fees − chargebacks), as on the Orders page. */
  readonly orderProfit: MoneyString;
}

export interface CampaignResult extends Omit<CampaignSpendRow, "spend" | "platformValue"> {
  readonly spend: Decimal | null;
  readonly platformValue: Decimal | null;
  readonly platformRoas: Decimal | null;
  /** Null when the row is not attributable. */
  readonly utmOrders: number | null;
  readonly utmRevenue: Decimal | null;
  readonly utmOrderProfit: Decimal | null;
  readonly utmRoas: Decimal | null;
  /** UTM order profit − spend: what the campaign left after paying for itself (UTM-modeled). */
  readonly utmProfitAfterAds: Decimal | null;
}

export interface UtmGroup {
  readonly platform: AdPlatformKey | null;
  readonly source: string | null;
  readonly medium: string | null;
  readonly campaign: string | null;
  readonly orders: number;
  readonly revenue: Decimal;
  readonly orderProfit: Decimal;
  readonly reason: "no_utm" | "not_paid_platform" | "no_campaign_data" | "no_matching_campaign" | "ambiguous";
}

export interface AdsAttribution {
  readonly campaigns: readonly CampaignResult[];
  /** UTM groups that could not be credited to exactly one campaign. */
  readonly unattributed: readonly UtmGroup[];
}

const PLATFORM_SOURCES: Record<string, AdPlatformKey> = {
  google: "google_ads",
  "google-ads": "google_ads",
  googleads: "google_ads",
  adwords: "google_ads",
  facebook: "meta",
  fb: "meta",
  instagram: "meta",
  ig: "meta",
  meta: "meta",
  tiktok: "tiktok",
};

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

/** The ad platform a `utm_source` value refers to, if any (case-insensitive). */
export function platformForUtmSource(source: string | null): AdPlatformKey | null {
  return PLATFORM_SOURCES[norm(source)] ?? null;
}

/**
 * UTM-modeled campaign attribution (labelled "modeled" in the UI): an order is credited to the campaign of its
 * platform whose name or id equals the order's `utm_campaign` (case-insensitive). Orders without UTMs, from
 * non-ad sources, or whose campaign matches none or several campaigns are reported as unattributed, never
 * guessed. Platform-reported values are carried alongside unchanged.
 */
export function attributeCampaigns(campaigns: readonly CampaignSpendRow[], utm: readonly UtmRow[]): AdsAttribution {
  const credit = new Map<number, { orders: number; revenue: Decimal; profit: Decimal }>();
  const byKey = new Map<string, number[]>();
  const platformsWithCampaigns = new Set(campaigns.filter((c) => c.attributable).map((c) => c.platform));
  campaigns.forEach((c, i) => {
    if (!c.attributable) return;
    for (const k of new Set([norm(c.campaignName), norm(c.campaignId)])) {
      if (!k) continue;
      const key = `${c.platform}|${k}`;
      byKey.set(key, [...(byKey.get(key) ?? []), i]);
    }
  });

  const groups = new Map<string, UtmGroup>();
  const addUnattributed = (u: UtmRow, platform: AdPlatformKey | null, reason: UtmGroup["reason"]) => {
    const key = `${reason}|${platform}|${norm(u.source)}|${norm(u.medium)}|${norm(u.campaign)}`;
    const g = groups.get(key);
    groups.set(key, {
      platform,
      source: g?.source ?? u.source,
      medium: g?.medium ?? u.medium,
      campaign: g?.campaign ?? u.campaign,
      orders: (g?.orders ?? 0) + u.orders,
      revenue: (g?.revenue ?? ZERO).plus(dec(u.revenue)),
      orderProfit: (g?.orderProfit ?? ZERO).plus(dec(u.orderProfit)),
      reason,
    });
  };

  for (const u of utm) {
    if (!norm(u.source) && !norm(u.campaign)) {
      addUnattributed(u, null, "no_utm");
      continue;
    }
    const platform = platformForUtmSource(u.source);
    if (!platform) {
      addUnattributed(u, null, "not_paid_platform");
      continue;
    }
    if (!platformsWithCampaigns.has(platform)) {
      addUnattributed(u, platform, "no_campaign_data");
      continue;
    }
    const matches = byKey.get(`${platform}|${norm(u.campaign)}`) ?? [];
    if (matches.length !== 1) {
      addUnattributed(u, platform, matches.length === 0 ? "no_matching_campaign" : "ambiguous");
      continue;
    }
    const c = credit.get(matches[0]!) ?? { orders: 0, revenue: ZERO, profit: ZERO };
    credit.set(matches[0]!, { orders: c.orders + u.orders, revenue: c.revenue.plus(dec(u.revenue)), profit: c.profit.plus(dec(u.orderProfit)) });
  }

  return {
    campaigns: campaigns.map((c, i) => {
      const spend = c.spend === null ? null : dec(c.spend);
      const platformValue = c.platformValue === null ? null : dec(c.platformValue);
      const cr = credit.get(i) ?? { orders: 0, revenue: ZERO, profit: ZERO };
      return {
        ...c,
        spend,
        platformValue,
        platformRoas: spend && platformValue ? ratio(platformValue, spend) : null,
        utmOrders: c.attributable ? cr.orders : null,
        utmRevenue: c.attributable ? cr.revenue : null,
        utmOrderProfit: c.attributable ? cr.profit : null,
        utmRoas: c.attributable && spend ? ratio(cr.revenue, spend) : null,
        utmProfitAfterAds: c.attributable && spend ? cr.profit.minus(spend) : null,
      };
    }),
    unattributed: [...groups.values()].sort((a, b) => b.revenue.comparedTo(a.revenue)),
  };
}

/** A ROAS below break-even loses money on contribution; null when either side is unknown. */
export function belowBreakEven(roas: Decimal | null, breakEven: Decimal | null): boolean | null {
  return roas === null || breakEven === null ? null : roas.lt(breakEven);
}

