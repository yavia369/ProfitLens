import { FlaskConical, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectStoreForm } from "@/components/sync/connect-store-form";
import { listAdAccounts, listAdConnections } from "@profitlens/core/ads";
import { AdAccountRow, ConnectGoogleAdsForm } from "@/components/ads/google-ads";
import { Table, TBody, TH, THead, TR } from "@/components/ui/table";
import { db } from "@/server/db";
import { listAccessibleStores } from "@/server/reporting";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Stores & integrations" };

export default async function StoresPage() {
  const session = await requireAppSession();
  const stores = await listAccessibleStores(session.scope);
  const [connections, accounts] = await Promise.all([listAdConnections(db(), session.scope), listAdAccounts(db(), session.scope)]);
  const liveStoreOptions = stores.filter((s) => !s.isDemo).map((s) => ({ id: s.id, name: s.name, timezone: s.timezone, currency: s.currency }));
  const isAdmin = session.scope.role === "owner" || session.scope.role === "admin";
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
                {s.isDemo ? <Badge variant="demo">Demo — sample data</Badge> : <Badge variant="positive">Shopify</Badge>}
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
            <CardDescription>
              Create a read-only ProfitLens app in your store&apos;s Shopify Dev Dashboard, install it, then paste its credentials here.
              Step-by-step guide: <code className="rounded bg-muted px-1">docs/SHOPIFY_SETUP.md</code>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          {isAdmin ? <ConnectStoreForm /> : <p>Only workspace owners and admins can connect stores.</p>}
          <p className="text-xs">
            Required scopes: read_orders, read_products, read_inventory, read_customers, read_returns, read_shopify_payments_payouts,
            read_shopify_payments_disputes. Add <code className="rounded bg-muted px-1">read_all_orders</code> for history older than 60 days.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Google Ads</CardTitle>
            <CardDescription>
              Read-only access through a service account in your Google Cloud project. Spend syncs every 6 hours and re-reads the last 3 days to
              catch Google&apos;s corrections. Setup guide: <code className="rounded bg-muted px-1">docs/GOOGLE_ADS_SETUP.md</code>. Meta and TikTok: phase 8
              (until then, enter their spend under Costs → Ad spend).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {connections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.displayName}</span>
              <Badge variant={c.status === "active" ? "positive" : "negative"}>{c.status === "active" ? "connected" : c.status.replace("_", " ")}</Badge>
              {c.loginCustomerId ? <span className="text-muted-foreground">via manager {c.loginCustomerId}</span> : null}
              {c.lastError ? <span className="text-negative">{c.lastError}</span> : null}
            </div>
          ))}
          {accounts.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Ad account</TH>
                  <TH>Store</TH>
                  <TH>Sync</TH>
                  <TH>Status</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {accounts.map(({ a }) => (
                  <AdAccountRow
                    key={a.id}
                    editable={isAdmin}
                    stores={liveStoreOptions}
                    account={{
                      id: a.id,
                      customerId: a.externalId,
                      name: a.name,
                      currency: a.currency,
                      timezone: a.timezone,
                      isManager: a.isManager,
                      accountStatus: a.accountStatus,
                      storeId: a.storeId,
                      syncEnabled: a.syncEnabled,
                      spendSyncedThrough: a.spendSyncedThrough,
                      lastError: a.lastError,
                    }}
                  />
                ))}
              </TBody>
            </Table>
          ) : null}
          {isAdmin ? <ConnectGoogleAdsForm reconnect={connections.length > 0} /> : <p className="text-muted-foreground">Only workspace owners and admins can connect Google Ads.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
