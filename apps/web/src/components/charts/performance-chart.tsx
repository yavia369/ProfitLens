"use client";

import type { SeriesPoint } from "@profitlens/core";
import type { Granularity } from "@profitlens/finance";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { ChartFrame, LegendItem, TooltipCard } from "./chart-frame";

const C = { revenue: "var(--series-1)", costs: "var(--series-2)", profit: "var(--series-3)" };

// Chart geometry needs numbers; values are converted only for plotting. Labels/tooltips use the exact strings.
const plot = (s: string) => Number(s);

export function bucketLabel(bucket: string, g: Granularity): string {
  if (g === "month") return formatDate(bucket, { month: "short", year: "2-digit" });
  if (g === "week") return `Wk of ${formatDate(bucket)}`;
  return formatDate(bucket);
}

export function PerformanceChart({ series, currency, granularity }: { series: readonly SeriesPoint[]; currency: string; granularity: Granularity }) {
  const data = series.map((p) => ({ ...p, r: plot(p.revenue), c: plot(p.totalCosts), n: plot(p.netProfit) }));
  return (
    <ChartFrame
      title="Revenue, costs and net profit"
      description={`By ${granularity}. All series share one currency axis.${series.some((p) => p.partial) ? " The latest period is still in progress (shown lighter)." : ""}`}
      legend={
        <>
          <LegendItem color={C.revenue} label="Revenue" />
          <LegendItem color={C.costs} label="Total costs" />
          <LegendItem color={C.profit} label="Net profit" kind="line" />
        </>
      }
      table={
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">Total costs</TH>
              <TH className="text-right">Net profit</TH>
              <TH className="text-right">Net margin</TH>
            </TR>
          </THead>
          <TBody>
            {series.map((p) => (
              <TR key={p.bucket}>
                <TD>
                  {bucketLabel(p.bucket, granularity)}
                  {p.partial ? <span className="text-subtle"> (in progress)</span> : null}
                </TD>
                <TD className="text-right tabular">{formatMoney(p.revenue, currency)}</TD>
                <TD className="text-right tabular">{formatMoney(p.totalCosts, currency, { asCost: true })}</TD>
                <TD className="text-right tabular">{formatMoney(p.netProfit, currency)}</TD>
                <TD className="text-right tabular">{formatPercent(p.netMargin)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      <div className="h-72" role="img" aria-label="Revenue, total costs and net profit by period">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(b: string) => bucketLabel(b, granularity)}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(v: number) => formatMoney(String(v), currency, { compact: true })}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as SeriesPoint) : null;
                if (!p) return null;
                return (
                  <TooltipCard
                    title={`${bucketLabel(p.bucket, granularity)}${p.partial ? " (in progress)" : ""}`}
                    rows={[
                      { color: C.revenue, label: "Revenue", value: formatMoney(p.revenue, currency) },
                      { color: C.costs, label: "Total costs", value: formatMoney(p.totalCosts, currency, { asCost: true }) },
                      { color: C.profit, label: "Net profit", value: formatMoney(p.netProfit, currency) },
                      { label: "Net margin", value: formatPercent(p.netMargin) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="r" name="Revenue" fill={C.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {data.map((p) => (
                <Cell key={p.bucket} fillOpacity={p.partial ? 0.45 : 1} />
              ))}
            </Bar>
            <Bar dataKey="c" name="Total costs" fill={C.costs} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {data.map((p) => (
                <Cell key={p.bucket} fillOpacity={p.partial ? 0.45 : 1} />
              ))}
            </Bar>
            <Line
              dataKey="n"
              name="Net profit"
              type="monotone"
              stroke={C.profit}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
