import { COMPARISON_MODES, DATE_PRESETS, type ComparisonMode, type DatePreset, type Granularity } from "@profitlens/finance";

/** Report parameters as carried in the URL (shareable, bookmarkable). */
export interface ReportParams {
  store: string;
  preset: DatePreset | "custom";
  start?: string;
  end?: string;
  compare: ComparisonMode;
  granularity?: Granularity;
}

export const DEFAULT_PARAMS: ReportParams = { store: "demo", preset: "last_30_days", compare: "previous_period" };

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  this_year: "This year",
};

export const COMPARE_LABELS: Record<ComparisonMode, string> = {
  previous_period: "Previous period",
  previous_month: "Same period last month",
  previous_year: "Same period last year",
  none: "No comparison",
};

export function isPreset(v: string | null): v is DatePreset {
  return v !== null && (DATE_PRESETS as readonly string[]).includes(v);
}

export function isCompare(v: string | null): v is ComparisonMode {
  return v !== null && (COMPARISON_MODES as readonly string[]).includes(v);
}

export function toSearchParams(p: ReportParams): URLSearchParams {
  const sp = new URLSearchParams({ store: p.store, preset: p.preset, compare: p.compare });
  if (p.preset === "custom" && p.start && p.end) {
    sp.set("start", p.start);
    sp.set("end", p.end);
  }
  if (p.granularity) sp.set("granularity", p.granularity);
  return sp;
}
