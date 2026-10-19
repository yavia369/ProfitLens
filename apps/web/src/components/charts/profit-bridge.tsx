"use client";

import type { DashboardPayload } from "@profitlens/core";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChartFrame } from "./chart-frame";

type Bridge = NonNullable<DashboardPayload["bridge"]>;

/**
 * Profit variance bridge as a diverging bar list around a zero line: each step's bar grows right when it
 * raised net profit and left when it lowered it. Signed values are always printed, so direction never relies
 * on color alone.
 */
export function ProfitBridgeChart({ bridge, currency }: { bridge: Bridge; currency: string }) {
  // Geometry only (bar lengths); every value shown is the exact formatted string.
  const max = Math.max(...bridge.steps.map((s) => Math.abs(Number(s.effect))), 0);
  const signed = (v: string) => formatMoney(v, currency, { signDisplay: "exceptZero" });
  return (
    <ChartFrame
      title="What changed net profit"
      description="Versus the comparison period. Order volume and order value split the revenue change; each cost line shows its effect on profit. Steps are rounded to cents separately, so they can differ from the total by a cent."
      table={
        <Table>
          <THead>
            <TR>
              <TH>Step</TH>
              <TH className="text-right">Effect on net profit</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>Net profit, comparison period</TD>
              <TD className="text-right tabular">{formatMoney(bridge.start, currency)}</TD>
            </TR>
            {bridge.steps.map((s) => (
              <TR key={s.key}>
                <TD>{s.label}</TD>
                <TD className="text-right tabular">{signed(s.effect)}</TD>
              </TR>
            ))}
            <TR>
              <TD className="font-medium">Net profit, this period</TD>
              <TD className="text-right font-medium tabular">{formatMoney(bridge.end, currency)}</TD>
            </TR>
          </TBody>
        </Table>
      }
    >
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-baseline justify-between border-b pb-2 text-muted-foreground">
          <span>Comparison period</span>
          <span className="tabular font-medium text-foreground">{formatMoney(bridge.start, currency)}</span>
        </div>
        <ul className="flex flex-col">
          {bridge.steps.map((s) => {
            const v = Number(s.effect);
            const pct = max === 0 ? 0 : (Math.abs(v) / max) * 50;
            return (
              <li
                key={s.key}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded py-1.5 hover:bg-accent/60 sm:grid-cols-[minmax(7rem,11rem)_1fr_6.5rem]"
                title={s.description}
              >
                <span className="truncate">{s.label}</span>
                {/* Below sm the bar takes its own full-width row so it keeps a readable length. */}
                <span className="relative order-last col-span-2 h-4 sm:order-none sm:col-span-1" aria-hidden>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  {v !== 0 ? (
                    <span
                      className={cn("absolute top-0.5 h-3", v > 0 ? "left-1/2 rounded-r bg-positive" : "right-1/2 rounded-l bg-negative")}
                      style={{ width: `${pct}%` }}
                    />
                  ) : null}
                </span>
                <span className={cn("text-right tabular", v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-muted-foreground")}>{signed(s.effect)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="font-medium">This period</span>
          <span className="tabular font-semibold">{formatMoney(bridge.end, currency)}</span>
        </div>
      </div>
    </ChartFrame>
  );
}
