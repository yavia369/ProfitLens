import { AlertTriangle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning"; title: string; children?: ReactNode; className?: string }) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "warning" ? "border-warning/30 bg-warning-soft" : "bg-muted",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warning" ? "text-warning" : "text-muted-foreground")} aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}
