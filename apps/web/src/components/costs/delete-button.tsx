"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/costs/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "./form-message";

/** Two-step delete (click, then confirm) for a cost rule or expense. */
export function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<ActionState> }) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  if (state && !state.ok) return <FormMessage state={state} />;
  return confirming ? (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => setState(await onDelete()))}>
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="icon-sm" variant="ghost" aria-label={label} onClick={() => setConfirming(true)}>
      <Trash2 className="size-3.5" aria-hidden />
    </Button>
  );
}
