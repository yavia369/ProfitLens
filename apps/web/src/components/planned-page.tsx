import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Explicit "not built yet" state: names the phase and what will ship, so nothing pretends to work. */
export function PlannedPage({ title, phase, summary, items }: { title: string; phase: number; summary: string; items: readonly string[] }) {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-5 text-sm text-muted-foreground">{summary}</p>
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <CalendarClock className="size-5" aria-hidden />
          </div>
          <div>
            <p className="font-medium">Planned for phase {phase}</p>
            <p className="mt-1 text-sm text-muted-foreground">This page is not functional yet. It will include:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
