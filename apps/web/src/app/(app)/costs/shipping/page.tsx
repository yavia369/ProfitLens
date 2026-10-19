import { listHandlingRules, listShippingRules } from "@profitlens/core/profit";
import { todayIn } from "@profitlens/finance";
import { Truck } from "lucide-react";
import { deleteHandlingRuleAction, deleteShippingRuleAction } from "@/app/(app)/costs/actions";
import { CostPage } from "@/components/costs/cost-page";
import { DeleteButton } from "@/components/costs/delete-button";
import { HandlingRuleForm, ShippingRuleSheet, type ShippingRuleValues } from "@/components/costs/shipping-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { canEdit, costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Shipping costs" };

const d = (v: string) => formatDate(v, { day: "numeric", month: "short", year: "numeric" });
const period = (from: string, to: string | null) => (to ? `${d(from)} – ${d(to)} (excl.)` : `From ${d(from)}`);

/** Grams as kg for display (a count, not money). */
const formatWeight = (g: number) => `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(g / 1000)} kg`;

function describe(rule: ShippingRuleValues, currency: string): string {
  const p = rule.params as Record<string, string> & { tiers?: { minQuantity?: number; minGrams?: number; amount: string }[] };
  switch (rule.type) {
    case "per_order":
      return `${formatMoney(p.amount ?? "0", currency)} per order`;
    case "per_item":
      return `${formatMoney(p.amount ?? "0", currency)} per item`;
    case "first_plus_additional":
      return `${formatMoney(p.first ?? "0", currency)} first item + ${formatMoney(p.additional ?? "0", currency)} each additional`;
    case "tiered_quantity":
      return (p.tiers ?? []).map((t) => `${t.minQuantity}+ items: ${formatMoney(t.amount, currency)}`).join(" · ");
    case "tiered_weight":
      return (p.tiers ?? []).map((t) => `${formatWeight(t.minGrams ?? 0)}+: ${formatMoney(t.amount, currency)}`).join(" · ");
  }
}

export default async function ShippingCostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const editable = canEdit(session);
  const [rules, handling] = store ? await Promise.all([listShippingRules(db(), session.scope, store.id), listHandlingRules(db(), session.scope, store.id)]) : [[], []];
  const defaultFrom = "2000-01-01";

  return (
    <CostPage
      title="Shipping & handling"
      description="What you pay to ship and pack orders (not the shipping your customers pay — that is revenue). Rules apply by order date."
      store={store}
      requestedDemo={requestedDemo}
      readOnly={!editable}
    >
      {(s) => (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Shipping cost rules</CardTitle>
                <CardDescription>
                  Orders with no matching rule have their shipping cost flagged as missing. Orders cancelled before fulfilment and orders without
                  shippable items cost nothing (see Calculation policy).
                </CardDescription>
              </div>
              {editable ? <ShippingRuleSheet storeId={s.id} currency={s.currency} defaultFrom={defaultFrom} /> : null}
            </CardHeader>
            {rules.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Rule</TH>
                    <TH>Cost</TH>
                    <TH>Countries</TH>
                    <TH className="text-right">Priority</TH>
                    <TH>Dates</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {rules.map((r) => {
                    const values: ShippingRuleValues = { id: r.id, name: r.name, type: r.type, params: r.params, countryCodes: r.countryCodes, priority: r.priority, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo };
                    const today = todayIn(s.timezone);
                    const active = r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo > today);
                    return (
                      <TR key={r.id}>
                        <TD className="font-medium">
                          {r.name} {active ? null : <Badge variant="neutral">inactive today</Badge>}
                        </TD>
                        <TD className="tabular">{describe(values, s.currency)}</TD>
                        <TD>{r.countryCodes?.join(", ") ?? "All"}</TD>
                        <TD className="text-right tabular">{r.priority}</TD>
                        <TD className="text-xs text-muted-foreground">{r.effectiveFrom <= defaultFrom && !r.effectiveTo ? "All history" : period(r.effectiveFrom, r.effectiveTo)}</TD>
                        <TD className="whitespace-nowrap text-right">
                          {editable ? (
                            <>
                              <ShippingRuleSheet storeId={s.id} currency={s.currency} rule={values} defaultFrom={defaultFrom} />
                              <DeleteButton label={`Delete rule ${r.name}`} onDelete={deleteShippingRuleAction.bind(null, s.id, r.id)} />
                            </>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={Truck} title="No shipping rules yet">
                Add a rule (for example a flat cost per order) so profit includes what you pay carriers. Until then every order&apos;s shipping cost is
                flagged as missing.
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Handling</CardTitle>
                <CardDescription>
                  Packing and fulfilment labour per order or per item. Use either these rules or the per-unit handling in product costs, not both.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {handling.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {handling.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-medium tabular">
                        {formatMoney(h.amount, s.currency)} {h.mode === "per_order" ? "per order" : "per item"}
                      </span>
                      <span className="text-xs text-muted-foreground">{h.effectiveFrom <= defaultFrom && !h.effectiveTo ? "All history" : period(h.effectiveFrom, h.effectiveTo)}</span>
                      <span className="ml-auto">{editable ? <DeleteButton label="Delete handling rule" onDelete={deleteHandlingRuleAction.bind(null, s.id, h.id)} /> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No handling rules: handling counts as zero (it is optional, so orders are not flagged).</p>
              )}
              {editable ? <HandlingRuleForm storeId={s.id} currency={s.currency} defaultFrom={defaultFrom} /> : null}
            </CardContent>
          </Card>
        </>
      )}
    </CostPage>
  );
}
