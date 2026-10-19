/** Ad channel names, shared by server pages and client forms. */
export const PLATFORM_LABEL: Record<string, string> = { google_ads: "Google Ads", meta: "Meta", tiktok: "TikTok", manual: "Other" };

/** Meta account statuses that can still be synced (mirrors SYNCABLE_STATUSES in @profitlens/meta-ads). */
export const META_SYNCABLE = new Set(["ACTIVE", "UNSETTLED", "PENDING_RISK_REVIEW", "PENDING_SETTLEMENT", "IN_GRACE_PERIOD"]);

/** Whether an API ad account can be synced, by platform. */
export function canSyncAccount(platform: string, status: string | null): boolean {
  return platform === "meta" ? META_SYNCABLE.has(status ?? "") : status === null || status === "ENABLED";
}
