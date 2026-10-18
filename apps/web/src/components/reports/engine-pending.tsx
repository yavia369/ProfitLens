import { DatabaseZap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown for live stores until the profit engine (phase 5) runs — no figures are shown rather than wrong ones. */
export function EnginePending({ message }: { message: string }) {
  return (
    <Card>
      <EmptyState
        icon={DatabaseZap}
        title="Shopify data imported — profit calculations arrive in phase 5"
        action={
          <Button asChild variant="outline">
            <Link href="/settings/sync">Open Sync Center</Link>
          </Button>
        }
      >
        {message} Until costs are applied by the calculation engine, ProfitLens shows no profit figures for this store rather than incomplete ones.
      </EmptyState>
    </Card>
  );
}
