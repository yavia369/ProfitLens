"use client";

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A labelled figure with an optional note and warning (warnings carry text, never colour alone). */
export function Stat({ label, value, note, warning }: { label: string; value: string; note?: ReactNode; warning?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm leading-snug text-muted-foreground">{label}</span>
      <p className="flex items-center gap-1.5 text-lg font-semibold tracking-tight tabular">
        <span className="truncate">{value}</span>
        {warning ? (
          <span title={warning} className="shrink-0 text-warning">
            <AlertTriangle className="size-3.5" aria-hidden />
            <span className="sr-only">({warning})</span>
          </span>
        ) : null}
      </p>
      {note ? <span className="text-xs text-subtle">{note}</span> : null}
    </div>
  );
}

export function StatGrid({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">{children}</CardContent>
    </Card>
  );
}
