import type { CostStatus } from "@profitlens/core";
import { Badge } from "@/components/ui/badge";

const COST_STATUS: Record<CostStatus, { label: string; variant: "positive" | "neutral" | "warning" | "negative" | "primary" }> = {
  actual: { label: "actual", variant: "positive" },
  manual: { label: "configured", variant: "neutral" },
  rule: { label: "rule", variant: "primary" },
  estimated: { label: "estimated", variant: "warning" },
  missing: { label: "missing", variant: "negative" },
};

export function CostStatusBadge({ status }: { status: CostStatus }) {
  const s = COST_STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function OrderStatusBadge({ financial }: { financial: string }) {
  const variant = financial === "refunded" ? "negative" : financial === "partially_refunded" ? "warning" : financial === "paid" ? "positive" : "neutral";
  return <Badge variant={variant}>{financial.replace(/_/g, " ")}</Badge>;
}
