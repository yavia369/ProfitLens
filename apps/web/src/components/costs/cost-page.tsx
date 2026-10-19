import type { StoreSummary } from "@profitlens/core";
import { Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/** Header and store guard shared by the per-store cost and policy pages. */
export function CostPage({
  title,
  description,
  store,
  requestedDemo,
  readOnly,
  children,
}: {
  title: string;
  description: string;
  store: StoreSummary | null;
  requestedDemo: boolean;
  readOnly: boolean;
  children: (store: StoreSummary) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          {description}
          {store ? (
            <>
              {" "}
              Store: <span className="font-medium text-foreground">{store.name}</span> ({store.currency}, {store.timezone}).
            </>
          ) : null}
        </p>
      </div>
      {requestedDemo && store ? (
        <Alert title="The demo store's costs are fixed sample data">Showing your connected store instead.</Alert>
      ) : null}
      {readOnly && store ? <Alert title="View only">Your role can view these settings but not change them.</Alert> : null}
      {store ? (
        children(store)
      ) : (
        <Card>
          <EmptyState
            icon={Store}
            title="No connected store yet"
            action={
              <Button asChild variant="outline">
                <Link href="/settings/stores">Connect a Shopify store</Link>
              </Button>
            }
          >
            Costs are set per connected store. The demo store uses fixed sample costs.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
