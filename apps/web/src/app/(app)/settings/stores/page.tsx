import { FlaskConical, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectStoreForm } from "@/components/sync/connect-store-form";
import { listAdAccounts, listAdConnections } from "@profitlens/core/ads";
import { AdAccountRow, ConnectGoogleAdsForm, ConnectMetaForm } from "@/components/ads/google-ads";
import { listPaymentConnections, listUnmatchedGatewayPayments, GATEWAY_LABEL } from "@profitlens/core/payments";
import { ConnectPaymentGatewayForm, SyncPaymentConnectionButton } from "@/components/payments/payment-gateways";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatInstant, formatMoney, formatRelative } from "@/lib/format";
import { db } from "@/server/db";
import { listAccessibleStores } from "@/server/reporting";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Stores & integrations" };

export default async function StoresPage() {
  const session = await requireAppSession();
  const stores = await listAccessibleStores(session.scope);
  const [connections, accounts, payments] = await Promise.all([listAdConnections(db(), session.scope), listAdAccounts(db(), session.scope), listPaymentConnections(db(), session.scope)]);
  const unmatched = await Promise.all(payments.map((p) => listUnmatchedGatewayPayments(db(), session.scope, p.id, 20)));
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
              catch Google&apos;s corrections. Setup guide: <code className="rounded bg-muted px-1">docs/GOOGLE_ADS_SETUP.md</code>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <Connections list={connections.filter((c) => c.platform === "google_ads")} />
          <AccountsTable accounts={accounts.filter(({ a }) => a.platform === "google_ads")} stores={liveStoreOptions} editable={isAdmin} />
          {isAdmin ? (
            <ConnectGoogleAdsForm reconnect={connections.some((c) => c.platform === "google_ads")} />
          ) : (
            <p className="text-muted-foreground">Only workspace owners and admins can connect Google Ads.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Meta Ads</CardTitle>
            <CardDescription>
              Read-only access through a system user in your Business Manager (ads_read). Spend and Meta-reported purchase value sync every 6 hours
              and re-read the last 3 days. Setup guide: <code className="rounded bg-muted px-1">docs/META_ADS_SETUP.md</code>. Spend you entered
              by hand for a day the API covers is replaced by the API figure.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <Connections list={connections.filter((c) => c.platform === "meta")} />
          <AccountsTable accounts={accounts.filter(({ a }) => a.platform === "meta")} stores={liveStoreOptions} editable={isAdmin} />
          {isAdmin ? (
            <ConnectMetaForm reconnect={connections.some((c) => c.platform === "meta")} />
          ) : (
            <p className="text-muted-foreground">Only workspace owners and admins can connect Meta.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payment processors</CardTitle>
            <CardDescription>
              Shopify does not report Stripe or PayPal fees. Connect the processor account (read-only) and ProfitLens imports each payment and its
              fee, and uses the actual fee on an order only when exactly one Shopify payment has the same amount and currency within 15 minutes.
              Every other order keeps the estimate from your fee rules and the payment is listed here. Syncs every 6 hours. Setup guide:{" "}
              <code className="rounded bg-muted px-1">docs/PAYMENT_GATEWAYS_SETUP.md</code>.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {payments.map((p, i) => {
            const tz = stores.find((s) => s.id === p.storeId)?.timezone ?? "UTC";
            const open = unmatched[i]!;
            return (
              <section key={p.id} className="rounded-lg border p-3" aria-label={`${GATEWAY_LABEL[p.gateway]} for ${p.storeName}`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.displayName}</span>
                      <span className="text-muted-foreground">→ {p.storeName}</span>
                      <Badge variant={p.status === "active" ? "positive" : "negative"}>{p.status === "active" ? "connected" : p.status.replace("_", " ")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.matched} matched · {p.open} on the estimated fee{p.lastSyncedAt ? ` · synced ${formatRelative(p.lastSyncedAt.toISOString())}` : " · not synced yet"}
                    </p>
                    {p.lastError ? <p className="text-xs text-negative">{p.lastError}</p> : null}
                  </div>
                  {session.scope.role !== "viewer" ? (
                    <div className="ml-auto">
                      <SyncPaymentConnectionButton connectionId={p.id} />
                    </div>
                  ) : null}
                </div>
                {open.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Unmatched payments ({p.open > open.length ? `latest ${open.length} of ${p.open}` : p.open}) — their orders keep the estimated fee
                    </summary>
                    <Table className="mt-2">
                      <THead>
                        <TR>
                          <TH>When</TH>
                          <TH>Payment</TH>
                          <TH className="text-right">Amount</TH>
                          <TH className="text-right">Fee</TH>
                          <TH>Why not matched</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {open.map((u) => (
                          <TR key={u.externalId}>
                            <TD className="whitespace-nowrap text-xs">{formatInstant(u.occurredAt.toISOString(), tz)}</TD>
                            <TD className="font-mono text-xs">{u.externalId}</TD>
                            <TD className="text-right tabular-nums">{formatMoney(u.amount, u.currency)}</TD>
                            <TD className="text-right tabular-nums">{formatMoney(u.fee, u.feeCurrency)}</TD>
                            <TD className="text-xs text-muted-foreground">{u.status === "ambiguous" ? "Ambiguous: " : ""}{u.reason ?? "Not matched yet"}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </details>
                ) : null}
              </section>
            );
          })}
          {isAdmin ? (
            liveStoreOptions.length ? (
              <ConnectPaymentGatewayForm stores={liveStoreOptions} />
            ) : (
              <p className="text-muted-foreground">Connect a Shopify store first.</p>
            )
          ) : (
            <p className="text-muted-foreground">Only workspace owners and admins can connect payment processors.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type Connection = Awaited<ReturnType<typeof listAdConnections>>[number];
type Account = Awaited<ReturnType<typeof listAdAccounts>>[number];

function Connections({ list }: { list: readonly Connection[] }) {
  return list.map((c) => (
    <div key={c.id} className="flex flex-wrap items-center gap-2">
      <span className="font-medium">{c.displayName}</span>
      <Badge variant={c.status === "active" ? "positive" : "negative"}>{c.status === "active" ? "connected" : c.status.replace("_", " ")}</Badge>
      {c.loginCustomerId ? <span className="text-muted-foreground">via manager {c.loginCustomerId}</span> : null}
      {c.lastError ? <span className="text-negative">{c.lastError}</span> : null}
    </div>
  ));
}

function AccountsTable({ accounts, stores, editable }: { accounts: readonly Account[]; stores: readonly { id: string; name: string; timezone: string; currency: string }[]; editable: boolean }) {
  if (!accounts.length) return null;
  return (
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
            editable={editable}
            stores={stores}
            account={{
              id: a.id,
              platform: a.platform,
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
  );
}
