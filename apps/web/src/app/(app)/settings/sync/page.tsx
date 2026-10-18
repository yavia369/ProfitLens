import { CheckCircle2, CircleAlert, Clock, RefreshCw, Store } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/sync/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatDate, formatInstant, formatMoney } from "@/lib/format";
import { loadSyncCenter } from "@/server/sync-center";
import { requireAppSession } from "@/server/session";
import { reconcileAction, reimportAction, syncNowAction } from "../actions";

export const metadata = { title: "Sync center" };
export const dynamic = "force-dynamic";

const JOB_LABEL: Record<string, string> = {
  "shopify.backfill": "Historical import",
  "shopify.incremental": "Incremental sync",
  "shopify.order": "Order refresh (webhook)",
  "shopify.reconcile": "Reconciliation",
};

function JobStatus({ status }: { status: string }) {
  const variant = status === "succeeded" ? "positive" : status === "failed" ? "negative" : status === "running" ? "primary" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

export default async function SyncCenterPage() {
  const session = await requireAppSession();
  const stores = await loadSyncCenter(session.scope);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sync center</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Import status of every connected store. Incremental sync runs every 15 minutes; order counts are reconciled with Shopify nightly.
        </p>
      </div>
      {stores.length === 0 ? (
        <Card>
          <EmptyState icon={Store} title="No stores connected" action={<Link className="text-sm font-medium text-primary hover:underline" href="/settings/stores">Connect a Shopify store</Link>}>
            The demo store doesn&apos;t sync — it is generated sample data.
          </EmptyState>
        </Card>
      ) : null}
      {stores.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {s.name}
                {s.connection?.status === "active" ? (
                  <Badge variant="positive"><CheckCircle2 /> connected</Badge>
                ) : (
                  <Badge variant="negative"><CircleAlert /> {s.connection?.status ?? "not connected"}</Badge>
                )}
                {s.connection?.historyLimited ? <Badge variant="warning">history limited to 60 days</Badge> : null}
              </CardTitle>
              <CardDescription>
                {s.shopDomain} · {s.currency} · {s.timezone}
                {s.plan ? ` · ${s.plan} plan` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={syncNowAction.bind(null, s.id)}><RefreshCw /> Sync now</ActionButton>
              <ActionButton action={reimportAction.bind(null, s.id)}>Re-import history</ActionButton>
              <ActionButton action={reconcileAction.bind(null, s.id)}>Reconcile</ActionButton>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {s.connection?.lastError ? (
              <p role="alert" className="rounded-md bg-negative-soft px-3 py-2 text-sm text-negative">{s.connection.lastError}</p>
            ) : null}
            {s.connection && s.connection.missingRequired.length ? (
              <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Missing scopes: {s.connection.missingRequired.join(", ")}</p>
            ) : null}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Orders", s.counts.orders],
                ["Line items", s.counts.lineItems],
                ["Sales ledger entries", s.counts.salesEntries],
                ["Refunds", s.counts.refunds],
                ["Payments (with actual fees)", `${formatCount(s.counts.transactions)} (${formatCount(s.counts.transactionsWithFees)})`],
                ["Disputes", s.counts.disputes],
                ["Products", s.counts.products],
                ["Variants", s.counts.variants],
                ["Variants with a cost", `${formatCount(s.counts.variantsWithCost)} of ${formatCount(s.counts.variants)}`],
                ["Cost versions", s.counts.costVersions],
                ["Customers", s.counts.customers],
                ["Webhooks (24 h)", s.webhooks24h],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular">{typeof value === "number" ? formatCount(value) : value}</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><Clock className="size-4" aria-hidden />
                Orders synced through: {s.connection?.ordersSyncedThrough ? formatInstant(s.connection.ordersSyncedThrough, s.timezone) : "not yet"}
              </p>
              <p>
                History imported from: {s.connection?.historyStart ? formatDate(s.connection.historyStart, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                {s.connection?.backfillCompletedAt ? ` · historical import completed ${formatInstant(s.connection.backfillCompletedAt, s.timezone)}` : s.connection?.backfillStartedAt ? " · historical import in progress" : ""}
              </p>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Recent jobs</h3>
              {s.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs yet. Jobs run in the worker process (<code className="rounded bg-muted px-1">pnpm --filter @profitlens/worker dev</code>).</p>
              ) : (
                <Table>
                  <THead>
                    <TR><TH>Job</TH><TH>Status</TH><TH>Started</TH><TH>Result</TH></TR>
                  </THead>
                  <TBody>
                    {s.jobs.map((j) => (
                      <TR key={j.id}>
                        <TD>{JOB_LABEL[j.kind] ?? j.kind}</TD>
                        <TD><JobStatus status={j.status} /></TD>
                        <TD className="text-muted-foreground">{j.startedAt ? formatInstant(j.startedAt, s.timezone) : "queued"}</TD>
                        <TD className="whitespace-normal text-xs text-muted-foreground">
                          {j.error ? <span className="text-negative">{j.error}</span> : j.stats ? Object.entries(j.stats).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "no changes" : j.progress ? `${j.progress.done}${j.progress.total ? ` / ${j.progress.total}` : ""} ${j.progress.unit}` : ""}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </section>

            {s.issues.length ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Open reconciliation differences</h3>
                <Table>
                  <THead><TR><TH>Day</TH><TH>Check</TH><TH className="text-right">Shopify</TH><TH className="text-right">ProfitLens</TH></TR></THead>
                  <TBody>
                    {s.issues.map((i) => (
                      <TR key={`${i.localDate}-${i.metric}`}>
                        <TD>{formatDate(i.localDate)}</TD>
                        <TD>{i.metric.replace(/_/g, " ")}</TD>
                        <TD className="text-right tabular">{formatCount(i.expected)}</TD>
                        <TD className="text-right tabular">{formatCount(i.actual)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </section>
            ) : null}

            {s.latestOrders.length ? (
              <section>
                <h3 className="mb-1 text-sm font-semibold">Latest imported orders</h3>
                <p className="mb-2 text-xs text-muted-foreground">Raw Shopify totals for verification — profit is not calculated until phase 5.</p>
                <Table>
                  <THead><TR><TH>Order</TH><TH>Date</TH><TH>Financial status</TH><TH className="text-right">Shopify total</TH><TH className="text-right">Ledger entries</TH></TR></THead>
                  <TBody>
                    {s.latestOrders.map((o) => (
                      <TR key={o.name}>
                        <TD className="font-medium">{o.name}</TD>
                        <TD className="text-muted-foreground">{formatDate(o.localDate)}</TD>
                        <TD>{o.financialStatus?.toLowerCase().replace(/_/g, " ") ?? "—"}</TD>
                        <TD className="text-right tabular">{formatMoney(o.totalPrice, o.currency)}</TD>
                        <TD className="text-right tabular">{o.ledgerEntries}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </section>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
