import { cn } from "@/lib/utils";

/** Result line of a server action (announced to screen readers). */
export function FormMessage({ state }: { state: { ok: boolean; message: string } | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("text-sm", state.ok ? "text-positive" : "text-negative")}>
      {state.message}
    </p>
  );
}
