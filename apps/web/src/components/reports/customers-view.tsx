"use client";

import type { CustomerReport, StoreSummary } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatGrid } from "./stat";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { formatCount, formatDate, formatDecimal, formatMoney, formatPercent, formatRatio, signOf } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";

type CohortMetric = "revenue" | "grossProfit" | "retention";
type Cell = CustomerReport["cohorts"][number]["cells"][number];

const COHORT_METRICS: Record<CohortMetric, { label: string; description: string; pick: (c: Cell) => string }> = {
  revenue: {
    label: "Revenue per customer",
    description: "Cumulative revenue of the cohort to the end of each month ÷ customers in the cohort (refunds reduce it when they happen).",
    pick: (c) => c.cumulativeRevenuePerCustomer,
  },
  grossProfit: {
    label: "Gross profit per customer",
    description: "Cumulative revenue − COGS of the cohort to the end of each month ÷ customers in the cohort.",
    pick: (c) => c.cumulativeGrossProfitPerCustomer,
  },
  retention: {
    label: "Customers ordering",
    description: "Share of the cohort that placed an order in each month. Month 0 is the first order, so it is always 100 %.",
    pick: (c) => c.retention,
  },
};

export function CustomersView() {
  const [params, , qs] = useReportParams();
  const [months, setMonths] = useState<6 | 12 | 24>(12);
  const [metric, setMetric] = useState<CohortMetric>("revenue");
  const q = useQuery({
    queryKey: ["customers", qs, months],
    queryFn: () => apiGet<CustomerReport>(`/api/reports/customers?${qs}&cohorts=${months}`),
    placeholderData: (prev) => prev,
  });
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = stores.data?.stores.find((s) => s.id === params.store);
  const r = q.data;
  const currency = r?.store.currency ?? current?.currency ?? "USD";
  const money = (v: string | null) => formatMoney(v, currency);
  const missingShare = r?.toDate.revenueMissingCogsShare ?? null;
  const cogsWarning = signOf(missingShare) === 1 ? `${formatPercent(missingShare)} of this revenue has no product cost, so gross profit is overstated` : null;

  return (
    <div>
      <ReportToolbar
        title="Customers"
        description="Retention and lifetime value observed from stored orders. Nothing here is predicted."
        resolved={r?.range}
        showCompare={false}
        isFetching={q.isFetching}
      >
        <NativeSelect aria-label="Cohorts" value={months} onChange={(e) => setMonths(Number(e.target.value) as 6 | 12 | 24)}>
          <option value={6}>Cohorts: 6 months</option>
          <option value={12}>Cohorts: 12 months</option>
          <option value={24}>Cohorts: 24 months</option>
        </NativeSelect>
      </ReportToolbar>
      {current?.isDemo ? <DemoBanner /> : null}
      {q.isError ? <Alert tone="warning" title="Couldn't load customers">{(q.error as Error).message}</Alert> : null}
      {r && !r.history.complete ? (
        <Alert tone="warning" title="Order history is incomplete" className="mb-4">
          Orders are stored from {r.history.start ? formatDate(r.history.start, { day: "numeric", month: "short", year: "numeric" }) : "the first sync"}. Without
          Shopify&apos;s read_all_orders permission only the last 60 days are available, so customers who ordered before then count as new and
          lifetime values are understated.
        </Alert>
      ) : null}

      {!r ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <StatGrid title="This period" description="Customers who placed an order in the selected range.">
              <Stat label="Customers" value={formatCount(r.period.customers)} />
              <Stat label="New customers" value={formatCount(r.period.newCustomers)} note="First order in this range" />
              <Stat label="Returning customers" value={formatCount(r.period.returningCustomers)} note={`${formatPercent(r.period.returningRate)} of customers`} />
              <Stat label="Orders per customer" value={formatDecimal(r.period.ordersPerCustomer)} />
              <Stat
                label="CAC (blended)"
                value={money(r.period.cac)}
                note={signOf(r.period.adSpend) === 0 ? "No ad spend recorded in this range" : `Ad spend ${money(r.period.adSpend)} ÷ new customers`}
                warning={signOf(r.period.adSpend) === 0 ? "No ad spend is recorded for this range, so CAC is 0. Connect an ad account or enter spend under Costs → Ad spend." : null}
              />
              {r.period.guestOrders > 0 ? <Stat label="Guest orders" value={formatCount(r.period.guestOrders)} note="No customer record; left out of customer figures" /> : null}
            </StatGrid>
            <StatGrid
              title="To date (observed)"
              description={`Every customer from the start of stored history to ${formatDate(r.range.end, { day: "numeric", month: "short", year: "numeric" })}.`}
            >
              <Stat label="Customers" value={formatCount(r.toDate.customers)} />
              <Stat label="Repeat rate" value={formatPercent(r.toDate.repeatRate)} note={`${formatCount(r.toDate.repeatCustomers)} with 2+ orders`} />
              <Stat label="Orders per customer" value={formatDecimal(r.toDate.ordersPerCustomer)} />
              <Stat label="Revenue per customer" value={money(r.toDate.revenuePerCustomer)} note="Observed LTV (revenue)" />
              <Stat label="Gross profit per customer" value={money(r.toDate.grossProfitPerCustomer)} note="Observed LTV (revenue − COGS)" warning={cogsWarning} />
              <Stat
                label="LTV : CAC"
                value={formatRatio(r.toDate.ltvToCac)}
                note="Gross profit per customer ÷ this period's CAC"
                warning={cogsWarning}
              />
            </StatGrid>
          </div>
          <BarList
            title="Revenue by customer type"
            description="Revenue in the selected range. New = from customers whose first order is in the range."
            color="var(--series-1)"
            emptyText="No revenue in this range."
            items={[
              { key: "new", label: "New customers", display: money(r.period.revenueNew), magnitude: Math.max(Number(r.period.revenueNew), 0) },
              { key: "returning", label: "Returning customers", display: money(r.period.revenueReturning), magnitude: Math.max(Number(r.period.revenueReturning), 0) },
              ...(signOf(r.period.revenueGuests) !== 0
                ? [{ key: "guests", label: "Guest orders", display: money(r.period.revenueGuests), magnitude: Math.max(Number(r.period.revenueGuests), 0) }]
                : []),
            ]}
          />
          <CohortTable report={r} metric={metric} onMetric={setMetric} currency={currency} />
        </div>
      )}
    </div>
  );
}

function CohortTable({ report, metric, onMetric, currency }: { report: CustomerReport; metric: CohortMetric; onMetric: (m: CohortMetric) => void; currency: string }) {
  const def = COHORT_METRICS[metric];
  const width = Math.max(0, ...report.cohorts.map((c) => c.cells.length));
  // Heat is geometry only: each cell's position between the smallest and largest value in the table
  // (month 0 retention is always 100 %, so it is left out).
  const heatValues = report.cohorts.flatMap((c) => c.cells.filter((x) => metric !== "retention" || x.offset > 0).map((x) => Number(def.pick(x))));
  const max = Math.max(...heatValues);
  const min = Math.min(...heatValues);
  const show = (x: Cell) => (metric === "retention" ? formatPercent(x.retention, 0) : formatMoney(def.pick(x), currency));
  const anyPartial = report.cohorts.some((c) => c.cells.some((x) => x.partial));
  return (
    <Card>
      <CardHeader className="flex-col sm:flex-row">
        <div>
          <CardTitle>Cohorts by first-order month</CardTitle>
          <CardDescription>{def.description}</CardDescription>
        </div>
        <NativeSelect aria-label="Cohort measure" value={metric} onChange={(e) => onMetric(e.target.value as CohortMetric)}>
          {Object.entries(COHORT_METRICS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      </CardHeader>
      <CardContent>
        {report.cohorts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No customers first ordered in these months.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0.5 text-sm">
              <caption className="sr-only">{def.label} by cohort and months since first order</caption>
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium">
                    Cohort
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Customers
                  </th>
                  {Array.from({ length: width }, (_, i) => (
                    <th key={i} scope="col" className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                      {i === 0 ? "Month 0" : `+${i}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.cohorts.map((c) => (
                  <tr key={c.month}>
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1.5 text-left font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {formatDate(`${c.month}-01`, { month: "short", year: "numeric" })}
                        {metric === "grossProfit" && signOf(c.revenueMissingCogs) !== 0 ? (
                          <span title={`${formatMoney(c.revenueMissingCogs, currency)} of this cohort's revenue has no product cost, so gross profit is overstated`} className="text-warning">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            <span className="sr-only">(gross profit overstated: some products have no cost)</span>
                          </span>
                        ) : null}
                      </span>
                    </th>
                    <td className="px-2 py-1.5 text-right tabular text-muted-foreground">{formatCount(c.customers)}</td>
                    {Array.from({ length: width }, (_, i) => {
                      const x = c.cells[i];
                      if (!x) return <td key={i} />;
                      const v = Number(def.pick(x));
                      const heat = metric === "retention" && x.offset === 0 ? null : max > min ? (v - min) / (max - min) : 1;
                      return (
                        <td
                          key={i}
                          className={cn("whitespace-nowrap rounded px-2 py-1.5 text-right tabular", x.partial && "italic")}
                          style={{ background: heat === null ? "var(--muted)" : `color-mix(in oklab, var(--series-1) ${Math.round(8 + heat * 47)}%, var(--card))` }}
                          title={`${formatDate(`${c.month}-01`, { month: "short", year: "numeric" })}, month ${x.offset}: ${show(x)} · ${formatCount(x.activeCustomers)} ordering${x.partial ? " · month in progress" : ""}`}
                        >
                          {show(x)}
                          {x.partial ? (
                            <>
                              <span aria-hidden>*</span>
                              <span className="sr-only">(month in progress)</span>
                            </>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {anyPartial ? <p className="mt-2 text-xs text-subtle">* Month in progress: the value will still change.</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
