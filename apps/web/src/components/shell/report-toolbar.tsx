"use client";

import { COMPARISON_MODES, type DateRange } from "@profitlens/finance";
import { FlaskConical, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { NativeSelect } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { formatInstant, formatRelative } from "@/lib/format";
import { COMPARE_LABELS, isCompare } from "@/lib/report-params";
import { useReportParams } from "@/lib/use-report-params";
import { DateRangeControl } from "./date-range-control";

export function ReportToolbar({
  title,
  description,
  resolved,
  showCompare = true,
  lastSyncedAt,
  timezone,
  isFetching,
  children,
}: {
  title: string;
  description?: string;
  resolved?: DateRange | undefined;
  showCompare?: boolean;
  lastSyncedAt?: string | null | undefined;
  timezone?: string | undefined;
  isFetching?: boolean;
  children?: ReactNode;
}) {
  const [params, update] = useReportParams();
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        {lastSyncedAt && timezone ? (
          <Tooltip content={`Data as of ${formatInstant(lastSyncedAt, timezone)} (${timezone}). Refreshes automatically every minute.`}>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-subtle">
              <RefreshCw className={isFetching ? "size-3 animate-spin" : "size-3"} aria-hidden />
              Updated {formatRelative(lastSyncedAt)}
            </p>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <DateRangeControl resolved={resolved} />
        {showCompare ? (
          <NativeSelect
            aria-label="Compare with"
            value={params.compare}
            onChange={(e) => isCompare(e.target.value) && update({ compare: e.target.value })}
          >
            {COMPARISON_MODES.map((m) => (
              <option key={m} value={m}>
                {m === "none" ? "No comparison" : `vs ${COMPARE_LABELS[m].toLowerCase()}`}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div role="note" className="mb-5 flex items-start gap-3 rounded-lg border border-demo/30 bg-demo-soft px-4 py-3 text-sm">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-demo" aria-hidden />
      <p>
        <span className="font-semibold text-demo">Demo data.</span>{" "}
        <span className="text-muted-foreground">
          You are viewing generated sample data for a fictional store. It is not connected to Shopify and is never mixed with live store data.
          Connect a store under <a className="font-medium text-foreground underline underline-offset-2" href="/settings/stores">Stores &amp; integrations</a>.
        </span>
      </p>
    </div>
  );
}
