"use client";

import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ChartFrame } from "./chart-frame";

export interface BarListItem {
  readonly key: string;
  readonly label: string;
  /** Exact formatted value shown as a direct label. */
  readonly display: string;
  /** Plot magnitude (geometry only). */
  readonly magnitude: number;
  readonly note?: string;
}

/**
 * Ranked horizontal bars with direct labels: one hue, sorted by magnitude (no legend needed).
 */
export function BarList({ title, description, items, color, emptyText }: { title: string; description?: string; items: readonly BarListItem[]; color: string; emptyText: string }) {
  const max = Math.max(...items.map((i) => i.magnitude), 0);
  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      table={
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.key}>
                <TD>{i.label}</TD>
                <TD className="text-right tabular">{i.display}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      }
    >
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.key} className="group">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{i.label}</span>
                <span className="shrink-0 font-medium tabular">{i.display}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted" title={`${i.label}: ${i.display}`}>
                <div className="h-2 rounded-full transition-[width]" style={{ width: `${max > 0 && i.magnitude > 0 ? Math.max((i.magnitude / max) * 100, 1.5) : 0}%`, background: color }} />
              </div>
              {i.note ? <p className="mt-1 text-xs text-subtle">{i.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}
