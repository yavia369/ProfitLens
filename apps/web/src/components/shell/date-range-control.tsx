"use client";

import { DATE_PRESETS, type DateRange } from "@profitlens/finance";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { DayPicker, type DateRange as PickerRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateRange } from "@/lib/format";
import { PRESET_LABELS } from "@/lib/report-params";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";

const toLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromLocal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** Preset list + custom calendar. `resolved` is the range the server resolved in the store timezone. */
export function DateRangeControl({ resolved }: { resolved?: DateRange | undefined }) {
  const [params, update] = useReportParams();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PickerRange | undefined>(undefined);

  const label =
    params.preset === "custom" && params.start && params.end
      ? formatDateRange(params.start, params.end)
      : PRESET_LABELS[params.preset as keyof typeof PRESET_LABELS];

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(resolved ? { from: fromLocal(resolved.start), to: fromLocal(resolved.end) } : undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2" aria-label={`Date range: ${label}`}>
          <CalendarDays className="text-muted-foreground" />
          <span>{label}</span>
          {resolved && params.preset !== "custom" ? (
            <span className="hidden text-muted-foreground xl:inline">· {formatDateRange(resolved.start, resolved.end)}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto flex-col gap-3 p-0 sm:flex-row">
        <ul className="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r" aria-label="Presets">
          {DATE_PRESETS.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => {
                  update({ preset: p });
                  setOpen(false);
                }}
                className={cn(
                  "w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                  params.preset === p && "bg-primary-soft font-medium text-primary",
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3 pt-0 sm:pt-3">
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={1}
            weekStartsOn={1}
            disabled={{ after: new Date() }}
            className="[--rdp-accent-color:var(--primary)] [--rdp-accent-background-color:var(--primary-soft)] text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Dates are in the store&apos;s timezone.</p>
            <Button
              size="sm"
              disabled={!draft?.from || !draft.to}
              onClick={() => {
                if (!draft?.from || !draft.to) return;
                update({ preset: "custom", start: toLocal(draft.from), end: toLocal(draft.to) });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
