"use client";

import type { StoreComparisonReport } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * P&L side by side for connected stores, with a consolidated column: added up when they share a currency, otherwise
 * converted day by day into the chosen currency with stored exchange rates (or explained when rates are missing).
 */
export function StoreComparison({ query, currencies, currency, onCurrency }: { query: string; currencies: readonly string[]; currency: string | null; onCurrency: (c: string) => void }) {
  const full = currency ? `${query}&currency=${currency}` : query;
  const q = useQuery({ queryKey: ["pnl-stores", full], queryFn: () => apiGet<StoreComparisonReport>(`/api/reports/pnl/stores?${full}`) });
  const r = q.data;
  if (q.isError) return <Alert tone="warning" title="Couldn't compare stores">{(q.error as Error).message}</Alert>;
  if (!r)
    return (
      <Card className="flex flex-col gap-2 p-4">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </Card>
    );
  const consolidated = r.consolidated.currency !== null;
  const fmt = (v: string | null, kind: string, currency: string) => (kind === "ratio" ? formatPercent(v) : formatMoney(v, currency, { asCost: kind === "cost" }));
  return (
    <>
      {currencies.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="consolidate-in" className="text-muted-foreground">
            Consolidate in
          </label>
          <NativeSelect id="consolidate-in" value={currency ?? r.consolidated.currency ?? ""} onChange={(e) => onCurrency(e.target.value)} className="w-28">
            {currency === null && r.consolidated.currency === null ? <option value="">—</option> : null}
            {[...new Set([...currencies, ...(currency ? [currency] : []), ...(r.consolidated.currency ? [r.consolidated.currency] : [])])].sort().map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
          {r.consolidated.currency !== null && r.consolidated.converted ? <span className="text-subtle">Converted at each day&apos;s stored exchange rate.</span> : null}
        </div>
      ) : null}
      {r.consolidated.currency === null ? <Alert title="No consolidated total" className="mb-4">{r.consolidated.reason}</Alert> : null}
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="sticky left-0 z-10 min-w-56 bg-muted px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Line</th>
              {r.stores.map((s) => (
                <th key={s.id} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  {s.name}
                  <span className="block font-normal">{s.currency}</span>
                </th>
              ))}
              {consolidated ? (
                <th className="whitespace-nowrap border-l px-4 py-2.5 text-right text-xs font-semibold">
                  Consolidated
                  <span className="block font-normal text-muted-foreground">{r.consolidated.currency}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => (
              <tr key={row.key} className={cn("border-b", row.kind === "subtotal" && "bg-muted/40 font-semibold", row.kind === "memo" && "text-muted-foreground")}>
                <td className={cn("sticky left-0 z-10 px-4 py-2", row.kind === "subtotal" ? "bg-muted" : "bg-card")}>{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={r.stores[i]!.id} className="whitespace-nowrap px-3 py-2 text-right tabular">
                    {fmt(v, row.kind, r.stores[i]!.currency)}
                  </td>
                ))}
                {consolidated ? <td className="whitespace-nowrap border-l px-4 py-2 text-right font-medium tabular">{fmt(row.total, row.kind, r.consolidated.currency!)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
