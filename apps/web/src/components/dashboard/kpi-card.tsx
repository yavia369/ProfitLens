"use client";

import { METRICS, type MetricKey } from "@profitlens/finance";
import type { KpiValue } from "@profitlens/core";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { formatChange, formatCount, formatMoney, formatPercent, formatRatio, signOf } from "@/lib/format";
import { cn } from "@/lib/utils";

export function formatMetric(key: MetricKey, value: string | null, currency: string, compact = false): string {
  const def = METRICS[key];
  switch (def.format) {
    case "currency":
      return formatMoney(value, currency, { compact, asCost: def.isCost === true });
    case "percent":
      return formatPercent(value);
    case "ratio":
      return formatRatio(value);
    case "count":
      return formatCount(value);
  }
}

/** Delta badge: arrow follows the direction of change; colour follows whether that change is good. */
function Delta({ metric, kpi, compareLabel }: { metric: MetricKey; kpi: KpiValue; compareLabel: string }) {
  const sign = signOf(kpi.change);
  if (sign === null) return <span className="text-xs text-subtle">No comparison data</span>;
  const polarity = METRICS[metric].polarity;
  const good = polarity === "neutral" || sign === 0 ? null : (sign > 0) === (polarity === "higher_is_better");
  const Icon = sign > 0 ? ArrowUpRight : sign < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular",
        good === null ? "text-muted-foreground" : good ? "text-positive" : "text-negative",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{formatChange(kpi.change)}</span>
      <span className="sr-only">{good === null ? "" : good ? "(favourable)" : "(unfavourable)"}</span>
      {compareLabel ? <span className="ml-1 hidden font-normal text-subtle sm:inline">{compareLabel}</span> : null}
    </span>
  );
}

export function MetricInfo({ metric }: { metric: MetricKey }) {
  const def = METRICS[metric];
  return (
    <Popover>
      <PopoverTrigger className="rounded text-subtle hover:text-foreground" aria-label={`How ${def.label} is calculated`}>
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm">
        <p className="font-medium">{def.label}</p>
        <p className="mt-1 text-muted-foreground">{def.formula}</p>
        {def.description ? <p className="mt-2 text-xs text-subtle">{def.description}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

export function KpiCard({
  metric,
  kpi,
  currency,
  compareLabel,
  incomplete,
  size = "md",
}: {
  metric: MetricKey;
  kpi: KpiValue;
  currency: string;
  compareLabel: string;
  incomplete?: boolean;
  size?: "lg" | "md";
}) {
  const def = METRICS[metric];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="truncate">{def.label}</span>
        <MetricInfo metric={metric} />
      </div>
      <p className={cn("flex items-center gap-1.5 font-semibold tracking-tight tabular", size === "lg" ? "text-2xl" : "text-lg")}>
        <span className="truncate">{formatMetric(metric, kpi.value, currency)}</span>
        {incomplete ? (
          <span title="Incomplete: some cost inputs are missing for this period" className="shrink-0 text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            <span className="sr-only">(incomplete: some cost inputs are missing)</span>
          </span>
        ) : null}
      </p>
      <Delta metric={metric} kpi={kpi} compareLabel={compareLabel} />
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
