import { listAdAccounts, listManualSpend } from "@profitlens/core/ads";
import { todayIn } from "@profitlens/finance";
import { Megaphone } from "lucide-react";
import Link from "next/link";
import { deleteManualSpendAction } from "@/app/(app)/costs/actions";
import { ManualSpendForm } from "@/components/ads/manual-spend-form";
import { PLATFORM_LABEL } from "@/components/ads/platforms";
import { CostPage } from "@/components/costs/cost-page";
import { DeleteButton } from "@/components/costs/delete-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { canEdit, costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Ad spend" };

export default async function AdSpendPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const editable = canEdit(session);
  const [entries, accounts] = store ? await Promise.all([listManualSpend(db(), session.scope, store.id), listAdAccounts(db(), session.scope)]) : [[], []];

  return (
    <CostPage
      title="Ad spend"
      description="Spend from connected ad accounts is imported automatically. Enter spend for channels that are not connected (Meta, TikTok, others) here."
      store={store}
      requestedDemo={requestedDemo}
      readOnly={!editable}
    >
      {(s) => {
        const synced = accounts.filter(({ a }) => a.storeId === s.id && a.syncEnabled && !a.isManager);
        return (
          <>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Connected accounts</CardTitle>
                  <CardDescription>
                    Imported spend replaces manual entries for the same channel and day, so nothing is counted twice.{" "}
                    <Link href="/settings/stores" className="underline underline-offset-2">
                      Manage connections
                    </Link>
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                {synced.length ? (
                  <ul className="divide-y rounded-lg border">
                    {synced.map(({ a }) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className="font-medium">{a.name}</span>
                        <Badge variant="positive">{PLATFORM_LABEL[a.platform] ?? a.platform}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {a.lastError ? <span className="text-negative">{a.lastError}</span> : a.spendSyncedThrough ? `Imported through ${formatDate(a.spendSyncedThrough, { day: "numeric", month: "short", year: "numeric" })}` : "Waiting for first import"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No ad account is syncing to this store yet.</p>
                )}
              </CardContent>
            </Card>

            {editable ? (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Add spend</CardTitle>
                    <CardDescription>Entering a day again replaces that day&apos;s amount for the channel.</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <ManualSpendForm storeId={s.id} currency={s.currency} today={todayIn(s.timezone)} />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Manual entries</CardTitle>
              </CardHeader>
              {entries.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Channel</TH>
                      <TH className="text-right">Spend</TH>
                      <TH>Note</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {entries.map((e) => (
                      <TR key={e.id}>
                        <TD>{formatDate(e.date, { day: "numeric", month: "short", year: "numeric" })}</TD>
                        <TD>
                          {PLATFORM_LABEL[e.platform] ?? e.platform} {e.isAdjustment ? <Badge variant="warning">adjustment</Badge> : null}
                        </TD>
                        <TD className="text-right tabular">{formatMoney(e.spend, e.currency)}</TD>
                        <TD className="max-w-64 truncate text-xs text-muted-foreground">{e.note}</TD>
                        <TD className="text-right">{editable ? <DeleteButton label="Delete this entry" onDelete={deleteManualSpendAction.bind(null, s.id, e.id)} /> : null}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <EmptyState icon={Megaphone} title="No manual ad spend">
                  Add spend for channels that are not connected so ROAS and profit after ads include them.
                </EmptyState>
              )}
            </Card>
          </>
        );
      }}
    </CostPage>
  );
}
