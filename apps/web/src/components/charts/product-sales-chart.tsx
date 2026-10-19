"use client";

import type { ProductDetailReport } from "@profitlens/core";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { ChartFrame, LegendItem, TooltipCard } from "./chart-frame";

const C = { sales: "var(--series-1)", profit: "var(--series-3)" };
type Point = ProductDetailReport["series"][number];

// Chart geometry needs numbers; values are converted only for plotting. Labels/tooltips use the exact strings.
const plot = (s: string) => Number(s);

/** Daily net sales (bars) and gross profit (line) of one product, on one currency axis. */
export function ProductSalesChart({ series, currency }: { series: readonly Point[]; currency: string }) {
  const data = series.map((p) => ({ ...p, s: plot(p.netSales), g: plot(p.grossProfit) }));
  return (
    <ChartFrame
      title="Net sales and gross profit"
      description="Per day, event-dated: refunds reduce the day they happen."
      legend={
        <>
          <LegendItem color={C.sales} label="Net sales" />
          <LegendItem color={C.profit} label="Gross profit" kind="line" />
        </>
      }
      table={
        <Table>
          <THead>
            <TR>
              <TH>Day</TH>
              <TH className="text-right">Units</TH>
              <TH className="text-right">Net sales</TH>
              <TH className="text-right">Gross profit</TH>
            </TR>
          </THead>
          <TBody>
            {series.map((p) => (
              <TR key={p.date}>
                <TD>{formatDate(p.date)}</TD>
                <TD className="text-right tabular">{formatCount(p.unitsSold)}</TD>
                <TD className="text-right tabular">{formatMoney(p.netSales, currency)}</TD>
                <TD className="text-right tabular">{formatMoney(p.grossProfit, currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      <div className="h-64" role="img" aria-label="Net sales and gross profit per day">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
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
                const p = active && payload?.[0] ? (payload[0].payload as Point) : null;
                if (!p) return null;
                return (
                  <TooltipCard
                    title={formatDate(p.date, { weekday: "short", day: "numeric", month: "short" })}
                    rows={[
                      { label: "Units", value: formatCount(p.unitsSold) },
                      { color: C.sales, label: "Net sales", value: formatMoney(p.netSales, currency) },
                      { color: C.profit, label: "Gross profit", value: formatMoney(p.grossProfit, currency) },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="s" name="Net sales" fill={C.sales} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            <Line dataKey="g" name="Gross profit" type="monotone" stroke={C.profit} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
