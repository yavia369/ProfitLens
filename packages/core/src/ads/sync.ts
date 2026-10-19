import { addDays, daysBetweenInclusive, dec, todayIn } from "@profitlens/finance";
import { schema } from "@profitlens/db";
import { campaignDailyQuery, GoogleAdsError, mapCampaignDaily, type RawCampaignDailyRow } from "@profitlens/google-ads";
import { CAMPAIGN_INSIGHT_FIELDS, mapCampaignInsight, MetaAdsError, type RawCampaignInsight } from "@profitlens/meta-ads";
import { and, between, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { clientForConnection, type AdsDeps } from "./connection";
import { metaClientForConnection } from "./meta";

/** History imported on the first sync (ARCHITECTURE §5). */
export const BACKFILL_DAYS = 3 * 365;
/** Each Google query covers at most this many days. */
export const WINDOW_DAYS = 90;
/** Meta returns one row per campaign and day; smaller windows keep pages small under the default access tier's limits. */
export const META_WINDOW_DAYS = 31;
/** Days re-read on every sync so platform restatements are picked up (FINANCIAL_MODEL §10). */
export const RESTATEMENT_DAYS = 3;

export interface AdsSyncStats {
  days: number;
  rows: number;
  campaigns: number;
  /** Days whose stored spend changed when re-read (restatements). */
  restatedDays: number;
}

/** One campaign-day as every platform adapter returns it (account currency, exact decimal strings). */
interface CampaignDay {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly campaignStatus: string | null;
  readonly channelType: string | null;
  readonly date: string;
  readonly spend: string;
  readonly impressions: bigint;
  readonly clicks: bigint;
  readonly conversions: string;
  readonly conversionValue: string;
}

type Account = typeof schema.adAccount.$inferSelect;

/** Platforms whose spend is imported from an API. */
export const API_PLATFORMS = ["google_ads", "meta"] as const;

/** Per-platform reader of daily campaign rows for [start, end] in the ad account's time zone. */
async function campaignDaysReader(deps: AdsDeps, acct: Account): Promise<{ windowDays: number; read: (start: string, end: string) => Promise<CampaignDay[]> }> {
  if (acct.platform === "google_ads") {
    const { client } = await clientForConnection(deps, acct.connectionId!);
    return {
      windowDays: WINDOW_DAYS,
      read: async (start, end) => (await client.searchStream<RawCampaignDailyRow>(acct.externalId, campaignDailyQuery(start, end), acct.loginCustomerId)).map(mapCampaignDaily),
    };
  }
  if (acct.platform === "meta") {
    const client = await metaClientForConnection(deps, acct.connectionId!);
    return {
      windowDays: META_WINDOW_DAYS,
      read: async (start, end) =>
        (await client.campaignInsightsDaily<RawCampaignInsight>(acct.externalId, start, end, CAMPAIGN_INSIGHT_FIELDS)).map((r) => ({ ...mapCampaignInsight(r), campaignStatus: null, channelType: null })),
    };
  }
  throw new GoogleAdsError(`Spend for ${acct.platform} accounts is entered manually.`, "config");
}

const configError = (platform: string, message: string) => (platform === "meta" ? new MetaAdsError(message, "config") : new GoogleAdsError(message, "config"));

/**
 * Imports daily campaign spend for API ad accounts (Google Ads, Meta) mapped to stores. Each window is replaced atomically
 * (delete + insert of the API rows), which makes re-runs idempotent and also captures restatements that lower
 * a campaign's spend to zero (Google omits zero rows).
 */
export class AdsSyncService {
  constructor(private readonly deps: AdsDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async syncAccount(accountId: string, opts: { full?: boolean } = {}): Promise<{ stats: AdsSyncStats; from: string; to: string }> {
    const db = this.deps.db;
    const [acct] = await db.select().from(schema.adAccount).where(eq(schema.adAccount.id, accountId));
    if (!acct) throw new Error(`ad account ${accountId} not found`);
    if (!acct.connectionId || acct.isManager || !acct.storeId) throw configError(acct.platform, "Only accounts mapped to a store (not managers) can be synced.");

    const [job] = await db
      .insert(schema.syncJob)
      .values({ organizationId: acct.organizationId, storeId: acct.storeId, kind: `ads.${acct.platform === "google_ads" ? "google" : acct.platform}.sync`, status: "running", startedAt: this.now(), attempts: 1, cursor: { accountId } })
      .returning({ id: schema.syncJob.id });
    const stats: AdsSyncStats = { days: 0, rows: 0, campaigns: 0, restatedDays: 0 };
    const to = todayIn(acct.timezone, this.now());
    const full = opts.full || !acct.spendSyncedThrough;
    const from = full ? addDays(to, -BACKFILL_DAYS) : addDays(acct.spendSyncedThrough!, -RESTATEMENT_DAYS);
    try {
      const reader = await campaignDaysReader(this.deps, acct);
      const campaigns = new Set<string>();
      for (let start = from; start <= to; start = addDays(start, reader.windowDays)) {
        const end = addDays(start, reader.windowDays - 1) < to ? addDays(start, reader.windowDays - 1) : to;
        const rows = await reader.read(start, end);
        await db.transaction(async (tx) => {
          const before = new Map(
            (
              await tx
                .select({ d: schema.adSpendDaily.date, s: sql<string>`sum(${schema.adSpendDaily.spend})` })
                .from(schema.adSpendDaily)
                .where(and(eq(schema.adSpendDaily.adAccountId, acct.id), eq(schema.adSpendDaily.source, "api"), between(schema.adSpendDaily.date, start, end)))
                .groupBy(schema.adSpendDaily.date)
            ).map((r) => [r.d, dec(r.s)]),
          );
          for (const c of new Map(rows.map((r) => [r.campaignId, r])).values()) {
            await tx
              .insert(schema.adCampaign)
              .values({ adAccountId: acct.id, externalId: c.campaignId, name: c.campaignName, status: c.campaignStatus, channelType: c.channelType })
              .onConflictDoUpdate({ target: [schema.adCampaign.adAccountId, schema.adCampaign.externalId], set: { name: c.campaignName, status: c.campaignStatus, channelType: c.channelType, updatedAt: new Date() } });
            campaigns.add(c.campaignId);
          }
          await tx.delete(schema.adSpendDaily).where(and(eq(schema.adSpendDaily.adAccountId, acct.id), eq(schema.adSpendDaily.source, "api"), between(schema.adSpendDaily.date, start, end)));
          if (rows.length) {
            await tx.insert(schema.adSpendDaily).values(
              rows.map((r) => ({
                adAccountId: acct.id,
                level: "campaign" as const,
                entityExternalId: r.campaignId,
                date: r.date,
                source: "api" as const,
                spend: r.spend,
                impressions: r.impressions,
                clicks: r.clicks,
                conversions: r.conversions,
                conversionValue: r.conversionValue,
              })),
            );
          }
          const after = new Map<string, ReturnType<typeof dec>>();
          for (const r of rows) after.set(r.date, (after.get(r.date) ?? dec("0")).plus(dec(r.spend)));
          for (const d of new Set([...before.keys(), ...after.keys()])) {
            const b = before.get(d);
            if (b && !b.minus(after.get(d) ?? dec("0")).abs().lte("0.01")) stats.restatedDays += 1;
          }
        });
        stats.rows += rows.length;
        stats.days += daysBetweenInclusive({ start, end });
      }
      stats.campaigns = campaigns.size;
      await db
        .update(schema.adAccount)
        .set({ spendSyncedThrough: to, lastSyncedAt: this.now(), lastError: null, ...(full ? { backfillCompletedAt: this.now() } : {}) })
        .where(eq(schema.adAccount.id, acct.id));
      await db.update(schema.syncJob).set({ status: "succeeded", finishedAt: this.now(), stats: { ...stats } }).where(eq(schema.syncJob.id, job!.id));
      return { stats, from, to };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(schema.adAccount).set({ lastError: message.slice(0, 500) }).where(eq(schema.adAccount.id, acct.id));
      await db.update(schema.syncJob).set({ status: "failed", finishedAt: this.now(), lastError: message.slice(0, 2000) }).where(eq(schema.syncJob.id, job!.id));
      if ((error instanceof GoogleAdsError || error instanceof MetaAdsError) && error.kind === "auth") {
        await db.update(schema.adConnection).set({ status: "needs_reauth", lastError: message.slice(0, 500) }).where(eq(schema.adConnection.id, acct.connectionId));
      }
      throw error;
    }
  }

  /** Accounts the scheduler should sync: API platforms, mapped to a store, sync on, not a manager. */
  async syncableAccounts(): Promise<string[]> {
    const rows = await this.deps.db
      .select({ id: schema.adAccount.id })
      .from(schema.adAccount)
      .where(and(inArray(schema.adAccount.platform, [...API_PLATFORMS]), eq(schema.adAccount.syncEnabled, true), eq(schema.adAccount.isManager, false), isNotNull(schema.adAccount.storeId)));
    return rows.map((r) => r.id);
  }
}
