import { feeSettings, gatewaySummary, listGatewayRules } from "@profitlens/core/profit";
import { CreditCard } from "lucide-react";
import { deleteGatewayRuleAction } from "@/app/(app)/costs/actions";
import { CostPage } from "@/components/costs/cost-page";
import { DeleteButton } from "@/components/costs/delete-button";
import { GatewayRuleForm, ThirdPartyFeeForm } from "@/components/costs/fee-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCount, formatDate, formatMoney, formatPercent, plainAmount } from "@/lib/format";
import { canEdit, costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Transaction fees" };

const d = (v: string) => formatDate(v, { day: "numeric", month: "short", year: "numeric" });

export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const editable = canEdit(session);
  const [summary, rules, settings] = store
    ? await Promise.all([gatewaySummary(db(), session.scope, store.id), listGatewayRules(db(), session.scope, store.id), feeSettings(db(), session.scope, store.id)])
    : [[], [], null];

  return (
    <CostPage
      title="Transaction fees"
      description="Payment processing fees. Shopify Payments reports the actual fee per payment; other gateways need a rule."
      store={store}
      requestedDemo={requestedDemo}
      readOnly={!editable}
    >
      {(s) => (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payment gateways in your orders</CardTitle>
                <CardDescription>Where actual fees are reported, they are used as is. Gift cards and manual payment methods have no fee.</CardDescription>
              </div>
            </CardHeader>
            {summary.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Gateway</TH>
                    <TH className="text-right">Payments</TH>
                    <TH className="text-right">Volume</TH>
                    <TH className="text-right">Actual fees</TH>
                    <TH className="text-right">Effective rate</TH>
                    <TH>Fee source</TH>
                  </TR>
                </THead>
                <TBody>
                  {summary.map((g) => {
                    const rule = rules.some((r) => r.gateway.toLowerCase() === g.gateway.toLowerCase());
                    const source =
                      g.manual || g.gateway === "gift_card" ? (
                        <Badge variant="neutral">no fee</Badge>
                      ) : g.with_actual_fees === g.payments ? (
                        <Badge variant="positive">actual (Shopify)</Badge>
                      ) : rule ? (
                        <Badge variant="primary">rule</Badge>
                      ) : (
                        <Badge variant="negative">missing — add a rule</Badge>
                      );
                    return (
                      <TR key={g.gateway}>
                        <TD className="font-medium">{g.gateway}</TD>
                        <TD className="text-right tabular">{formatCount(g.payments)}</TD>
                        <TD className="text-right tabular">{formatMoney(g.volume, s.currency)}</TD>
                        <TD className="text-right tabular">{g.with_actual_fees ? formatMoney(g.actual_fees, s.currency) : "—"}</TD>
                        <TD className="text-right tabular">{formatPercent(g.effective_rate, 2)}</TD>
                        <TD>{source}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={CreditCard} title="No payments imported yet" />
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Fee rules</CardTitle>
                <CardDescription>
                  For gateways without reported fees: fee = payment × rate (rounded to the cent) + fixed amount, per successful payment.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {rules.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {rules.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="font-medium">{r.gateway}</span>
                      <span className="tabular">
                        {plainAmount(r.percentRate)}% + {formatMoney(r.fixedFee, s.currency)}
                      </span>
                      {r.thirdPartyFeeApplies ? <Badge variant="neutral">+ Shopify third-party fee</Badge> : null}
                      <span className="text-xs text-muted-foreground">{r.effectiveTo ? `${d(r.effectiveFrom)} – ${d(r.effectiveTo)} (excl.)` : r.effectiveFrom <= "2000-01-01" ? "All history" : `From ${d(r.effectiveFrom)}`}</span>
                      <span className="ml-auto">{editable ? <DeleteButton label={`Delete fee rule for ${r.gateway}`} onDelete={deleteGatewayRuleAction.bind(null, s.id, r.id)} /> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No fee rules.</p>
              )}
              {editable ? <GatewayRuleForm storeId={s.id} currency={s.currency} gateways={summary.map((g) => g.gateway)} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">{settings ? <ThirdPartyFeeForm storeId={s.id} rate={settings.thirdPartyFeeRate} plan={settings.plan} /> : null}</CardContent>
          </Card>
        </>
      )}
    </CostPage>
  );
}
