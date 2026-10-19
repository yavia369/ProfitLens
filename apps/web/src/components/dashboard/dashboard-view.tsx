"use client";

import type { DashboardPayload } from "@profitlens/core";
import { isMetricKey, METRIC_KEYS, METRICS, type MetricKey } from "@profitlens/finance";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { MarginChart } from "@/components/charts/margin-chart";
import { OrdersChart } from "@/components/charts/orders-chart";
import { PerformanceChart } from "@/components/charts/performance-chart";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { formatMoney, formatPercent, formatRatio } from "@/lib/format";
import { COMPARE_LABELS } from "@/lib/report-params";
import { useReportParams } from "@/lib/use-report-params";
import { KpiCard, KpiSkeleton } from "./kpi-card";

const HERO: readonly MetricKey[] = ["netProfit", "revenue", "ordersCount", "netMargin", "adSpend"];
const DEFAULT_SECONDARY: readonly MetricKey[] = [
  "cogs",
  "grossProfit",
  "shippingCost",
  "transactionFees",
  "customExpenses",
  "contributionMargin",
  "roas",
  "breakEvenRoas",
  "mer",
  "aov",
  "refundRate",
  "cac",
];
const STORAGE_KEY = "profitlens.dashboard.cards.v1";
/** Metrics whose value depends on cost inputs (flagged when costs are missing). */
const COST_DEPENDENT = new Set<MetricKey>(["netProfit", "netMargin", "cogs", "grossProfit", "grossMargin", "contributionBeforeAds", "contributionMargin", "contributionAfterAds", "totalCosts", "breakEvenRoas", "breakEvenCpa", "profitPerOrder", "costPerOrder"]);

/** Card selection is a per-browser preference for now (moves to user settings in a later phase). */
function useCardSelection(): [MetricKey[], (keys: MetricKey[]) => void] {
  const [cards, setCards] = useState<MetricKey[]>([...DEFAULT_SECONDARY]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = (JSON.parse(raw) as unknown[]).filter((k): k is MetricKey => typeof k === "string" && isMetricKey(k));
        if (parsed.length) setCards(parsed);
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
  }, []);
  const save = (keys: MetricKey[]) => {
    setCards(keys);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  };
  return [cards, save];
}

function CompletenessNotice({ data }: { data: DashboardPayload }) {
  const c = data.completeness;
  if (c.complete) return null;
  const parts: string[] = [];
  if (c.ordersMissingCogs > 0)
    parts.push(`${c.ordersMissingCogs} order${c.ordersMissingCogs === 1 ? "" : "s"} contain products without a cost (${formatPercent(c.revenueMissingCogsShare)} of revenue)`);
  if (c.ordersMissingShipping > 0) parts.push(`${c.ordersMissingShipping} orders have no shipping cost rule`);
  if (c.transactionsMissingFees > 0) parts.push(`${c.transactionsMissingFees} payments have no fee data or rule`);
  if (c.fxIssues > 0) parts.push(`${c.fxIssues} amounts are missing an exchange rate`);
  return (
    <Alert tone="warning" title="Net profit is incomplete for this period" className="mb-5">
      {parts.join("; ")}. Missing costs are counted as zero and flagged — profit is overstated until they are configured.
    </Alert>
  );
}

export function DashboardView() {
  const [params, , qs] = useReportParams();
  const [cards, setCards] = useCardSelection();
  const query = useQuery({
    queryKey: ["dashboard", qs],
    queryFn: () => apiGet<DashboardPayload>(`/api/reports/dashboard?${qs}`),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  const data = query.data;
  const compareLabel = params.compare === "none" ? "" : `vs ${COMPARE_LABELS[params.compare].toLowerCase()}`;
  const incomplete = data ? !data.completeness.complete : false;

  return (
    <div>
      <ReportToolbar
        title="Dashboard"
        description={data ? `${data.store.name} · ${data.store.currency} · ${data.store.timezone}` : undefined}
        resolved={data?.range}
        lastSyncedAt={data?.store.lastSyncedAt}
        timezone={data?.store.timezone}
        isFetching={query.isFetching}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label="Customize metrics">
              <SlidersHorizontal className="text-muted-foreground" />
              <span className="hidden sm:inline">Metrics</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] w-64 overflow-y-auto">
            <DropdownMenuLabel>Shown below the headline row</DropdownMenuLabel>
            {METRIC_KEYS.filter((k) => !HERO.includes(k)).map((k) => (
              <DropdownMenuCheckboxItem
                key={k}
                checked={cards.includes(k)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => setCards(checked ? [...cards, k] : cards.filter((c) => c !== k))}
              >
                {METRICS[k].label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCards([...DEFAULT_SECONDARY])}>Reset to default</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ReportToolbar>

      {data?.store.isDemo ? <DemoBanner /> : null}


      {query.isError && !data ? (
        <Card>
          <EmptyState icon={AlertCircle} title="Couldn't load the dashboard" action={<Button variant="outline" onClick={() => query.refetch()}>Try again</Button>}>
            {(query.error as Error).message}
          </EmptyState>
        </Card>
      ) : null}

      {data ? <CompletenessNotice data={data} /> : null}

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 pt-5 md:grid-cols-3 xl:grid-cols-5">
          {HERO.map((k) =>
            data ? (
              <KpiCard key={k} metric={k} kpi={data.kpis[k]} currency={data.store.currency} compareLabel={compareLabel} incomplete={incomplete && COST_DEPENDENT.has(k)} size="lg" />
            ) : (
              <KpiSkeleton key={k} />
            ),
          )}
        </CardContent>
      </Card>

      {cards.length > 0 ? (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 pt-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {cards.map((k) =>
              data ? (
                <KpiCard key={k} metric={k} kpi={data.kpis[k]} currency={data.store.currency} compareLabel="" incomplete={incomplete && COST_DEPENDENT.has(k)} />
              ) : (
                <KpiSkeleton key={k} />
              ),
            )}
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <PerformanceChart series={data.series} currency={data.store.currency} granularity={data.granularity} />
          </div>
          <MarginChart series={data.series} granularity={data.granularity} />
          <BarList
            title="Where the money goes"
            description="Costs in the period, largest first."
            color="var(--series-2)"
            emptyText="No costs recorded in this period."
            items={data.costBreakdown.map((c) => ({
              key: c.key,
              label: c.label,
              display: formatMoney(c.amount, data.store.currency, { asCost: true }),
              magnitude: Number(c.amount),
            }))}
          />
          <BarList
            title="Ad spend by channel"
            description="Spend is exact; ROAS shown is platform-reported."
            color="var(--series-1)"
            emptyText="No ad spend in this period."
            items={data.adChannels.map((c) => ({
              key: c.channel,
              label: c.label,
              display: formatMoney(c.spend, data.store.currency),
              magnitude: Number(c.spend),
              note:
                (c.platformRoas !== null
                  ? `Platform-reported ROAS ${formatRatio(c.platformRoas)} · ${c.source === "api" ? "synced" : "manual entry"}`
                  : c.source === "manual"
                    ? "Manual entries — no platform conversion data"
                    : "No conversion data reported") + (c.timezoneApproximation ? " · account days are in another time zone (mapped date to date)" : ""),
            }))}
          />
          <OrdersChart series={data.series} granularity={data.granularity} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 xl:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      )}
    </div>
  );
}
