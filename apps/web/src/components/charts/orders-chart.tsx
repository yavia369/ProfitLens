"use client";

import type { SeriesPoint } from "@profitlens/core";
import type { Granularity } from "@profitlens/finance";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount } from "@/lib/format";
import { ChartFrame, TooltipCard } from "./chart-frame";
import { bucketLabel } from "./performance-chart";

export function OrdersChart({ series, granularity }: { series: readonly SeriesPoint[]; granularity: Granularity }) {
  return (
    <ChartFrame
      title="Orders"
      description={`Orders placed per ${granularity}.`}
      table={
        <Table>
          <THead>
            <TR>
              <TH>Period</TH>
              <TH className="text-right">Orders</TH>
            </TR>
          </THead>
          <TBody>
            {series.map((p) => (
              <TR key={p.bucket}>
                <TD>{bucketLabel(p.bucket, granularity)}</TD>
                <TD className="text-right tabular">{formatCount(p.orders)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      <div className="h-56" role="img" aria-label="Orders by period">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...series]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" tickFormatter={(b: string) => bucketLabel(b, granularity)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0] ? (payload[0].payload as SeriesPoint) : null;
                return p ? <TooltipCard title={bucketLabel(p.bucket, granularity)} rows={[{ color: "var(--series-1)", label: "Orders", value: formatCount(p.orders) }]} /> : null;
              }}
            />
            <Bar dataKey="orders" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
