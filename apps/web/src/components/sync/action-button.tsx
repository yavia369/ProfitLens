"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ActionButton({ action, children, variant = "outline" }: { action: () => Promise<ActionState>; children: ReactNode; variant?: "default" | "outline" | "secondary" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setResult(await action());
            } catch {
              setResult({ ok: false, message: "Request failed. Please try again." });
            }
          })
        }
      >
        {children}
      </Button>
      {result ? (
        <span role="status" className={cn("text-xs", result.ok ? "text-muted-foreground" : "text-negative")}>
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
