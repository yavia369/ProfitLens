import { FlaskConical, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAccessibleStores } from "@/server/reporting";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Stores & integrations" };

export default async function StoresPage() {
  const session = await requireAppSession();
  const stores = await listAccessibleStores(session.scope);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Stores & integrations</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Workspace: {session.organizationName}</p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Stores</CardTitle>
            <CardDescription>Each store keeps its own currency, timezone, costs and calculation policy.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {stores.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                {s.isDemo ? <FlaskConical className="size-4 text-demo" aria-hidden /> : <Store className="size-4 text-muted-foreground" aria-hidden />}
                <span className="font-medium">{s.name}</span>
                {s.isDemo ? <Badge variant="demo">Demo — sample data</Badge> : null}
                <span className="ml-auto text-muted-foreground">
                  {s.currency} · {s.timezone}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connect a Shopify store</CardTitle>
            <CardDescription>Arrives in phase 4.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connecting uses Shopify&apos;s OAuth with read-only scopes (orders, products, inventory costs, customers, returns, Shopify Payments
          fees and disputes). It requires a ProfitLens app in your Shopify Dev Dashboard and your approval to install it on the store. History
          older than 60 days needs Shopify&apos;s approval for the <code className="rounded bg-muted px-1">read_all_orders</code> scope.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Advertising accounts</CardTitle>
            <CardDescription>Google Ads arrives in phase 6; Meta and TikTok in phase 8.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Google Ads connects through your own Google Cloud project (OAuth). Spend will sync daily with a three-day restatement window. Manual
          ad-spend entry will always be available as a fallback.
        </CardContent>
      </Card>
    </div>
  );
}
