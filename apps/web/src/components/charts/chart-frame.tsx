"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Card wrapper for a chart with an accessible table-view toggle (data-viz accessibility rule). */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          aria-label={asTable ? `Show ${title} as chart` : `Show ${title} as table`}
          title={asTable ? "Show chart" : "Show table"}
        >
          {asTable ? <BarChart3 /> : <Table2 />}
        </Button>
      </CardHeader>
      <CardContent>
        {legend && !asTable ? <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{legend}</div> : null}
        {asTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}
      </CardContent>
    </Card>
  );
}

export function LegendItem({ color, label, kind = "box" }: { color: string; label: string; kind?: "box" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {kind === "box" ? (
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      ) : (
        <span className="h-0.5 w-3.5 rounded" style={{ background: color }} aria-hidden />
      )}
      {label}
    </span>
  );
}

/** Shared tooltip shell (text in ink colours; series identity shown by a swatch). */
export function TooltipCard({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-44 rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-foreground">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.color ? <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden /> : null}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-medium text-foreground tabular">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
