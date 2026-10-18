"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DEFAULT_PARAMS, isCompare, isPreset, toSearchParams, type ReportParams } from "./report-params";

/** Report filters live in the URL so views are shareable and survive reloads. */
export function useReportParams(): [ReportParams, (patch: Partial<ReportParams>) => void, string] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params = useMemo<ReportParams>(() => {
    const preset = sp.get("preset");
    const compare = sp.get("compare");
    const granularity = sp.get("granularity");
    const p: ReportParams = {
      store: sp.get("store") ?? DEFAULT_PARAMS.store,
      preset: preset === "custom" || isPreset(preset) ? preset : DEFAULT_PARAMS.preset,
      compare: isCompare(compare) ? compare : DEFAULT_PARAMS.compare,
    };
    if (p.preset === "custom") {
      const start = sp.get("start");
      const end = sp.get("end");
      if (start && end) {
        p.start = start;
        p.end = end;
      } else p.preset = DEFAULT_PARAMS.preset;
    }
    if (granularity === "day" || granularity === "week" || granularity === "month") p.granularity = granularity;
    return p;
  }, [sp]);

  const update = useCallback(
    (patch: Partial<ReportParams>) => {
      const next = { ...params, ...patch };
      if (patch.preset && patch.preset !== "custom") {
        delete next.start;
        delete next.end;
      }
      router.replace(`${pathname}?${toSearchParams(next).toString()}` as Route, { scroll: false });
    },
    [params, pathname, router],
  );

  return [params, update, toSearchParams(params).toString()];
}
