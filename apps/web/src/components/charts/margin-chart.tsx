"use client";

import type { SeriesPoint } from "@profitlens/core";
import type { Granularity } from "@profitlens/finance";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { ChartFrame, TooltipCard } from "./chart-frame";
import { bucketLabel } from "./performance-chart";

/** Net margin gets its own chart instead of a second y-axis on the currency chart. */
export function MarginChart({ series, granularity }: { series: readonly SeriesPoint[]; granularity: Granularity }) {
  const data = series.map((p) => ({ ...p, m: p.netMargin === null ? null : Number(p.netMargin) * 100 }));
  return (
    <ChartFrame
      title="Net margin"
      description="Net profit as a share of revenue."
      table={
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH className="text-right">Net margin</TH>
            </TR>
          </THead>
          <TBody>
            {series.map((p) => (
              <TR key={p.bucket}>
                <TD>{bucketLabel(p.bucket, granularity)}</TD>
                <TD className="text-right tabular">{formatPercent(p.netMargin)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      <div className="h-72" role="img" aria-label="Net margin by period">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel(b, granularity)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <ReferenceLine y={0} stroke="var(--chart-axis)" strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as SeriesPoint) : null;
                return p ? <TooltipCard title={bucketLabel(p.bucket, granularity)} rows={[{ color: "var(--series-1)", label: "Net margin", value: formatPercent(p.netMargin) }]} /> : null;
              }}
            />
            <Area dataKey="m" type="monotone" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.08} connectNulls isAnimationActive={false} activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
