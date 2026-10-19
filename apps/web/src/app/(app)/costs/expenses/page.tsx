import { listExpenseCategories, listExpenses } from "@profitlens/core/profit";
import { todayIn } from "@profitlens/finance";
import { Receipt } from "lucide-react";
import { archiveExpenseAction } from "@/app/(app)/costs/actions";
import { CostPage } from "@/components/costs/cost-page";
import { DeleteButton } from "@/components/costs/delete-button";
import { ExpenseSheet, type ExpenseValues } from "@/components/costs/expense-sheet";
import { EXPENSE_TYPES } from "@/components/costs/expense-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatMoney, plainAmount } from "@/lib/format";
import { canEdit, costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Expenses" };

const d = (v: string) => formatDate(v, { day: "numeric", month: "short", year: "numeric" });
const FREQ = { daily: "day", weekly: "week", monthly: "month" } as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const editable = canEdit(session);
  const [expenses, categories] = store ? await Promise.all([listExpenses(db(), session.scope, store.id), listExpenseCategories(db(), session.scope)]) : [[], []];
  const cats = categories.map((c) => ({ id: c.id, name: c.name, isMarketing: c.isMarketing }));

  return (
    <CostPage
      title="Expenses"
      description="Costs outside orders — apps, staff, rent, agency fees. Recurring costs are spread over their period, so daily profit stays realistic."
      store={store}
      requestedDemo={requestedDemo}
      readOnly={!editable}
    >
      {(s) => {
        const today = todayIn(s.timezone);
        return (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Custom expenses</CardTitle>
                <CardDescription>Applied when reports are read, from each expense&apos;s start date (and until its end date).</CardDescription>
              </div>
              {editable ? <ExpenseSheet storeId={s.id} currency={s.currency} categories={cats} defaultStart={today} /> : null}
            </CardHeader>
            {expenses.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Expense</TH>
                    <TH>Type</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Dates</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {expenses.map(({ e, category, isMarketing }) => {
                    const values: ExpenseValues = {
                      id: e.id,
                      name: e.name,
                      categoryId: e.categoryId,
                      type: e.type,
                      frequency: e.frequency,
                      allocation: e.allocation,
                      amount: e.amount,
                      percent: e.percent,
                      currency: e.currency,
                      startDate: e.startDate,
                      endDate: e.endDate,
                      isAdSpend: e.isAdSpend,
                      note: e.note,
                    };
                    const ended = e.endDate !== null && e.endDate < today;
                    return (
                      <TR key={e.id}>
                        <TD>
                          <p className="font-medium">{e.name}</p>
                          <p className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                            {category ? <span>{category}</span> : null}
                            {isMarketing ? <Badge variant="neutral">marketing</Badge> : null}
                            {e.isAdSpend ? <Badge variant="primary">ad spend</Badge> : null}
                            {ended ? <Badge variant="neutral">ended</Badge> : null}
                          </p>
                        </TD>
                        <TD>
                          {EXPENSE_TYPES.find((t) => t.value === e.type)?.label}
                          {e.frequency ? ` · every ${FREQ[e.frequency]}${e.allocation === "on_date" ? " (on date)" : ""}` : ""}
                        </TD>
                        <TD className="text-right tabular">{e.percent !== null ? `${plainAmount(e.percent)}%` : formatMoney(e.amount, e.currency)}</TD>
                        <TD className="text-xs text-muted-foreground">{e.type === "one_time" ? d(e.startDate) : e.endDate ? `${d(e.startDate)} – ${d(e.endDate)}` : `From ${d(e.startDate)}`}</TD>
                        <TD className="whitespace-nowrap text-right">
                          {editable ? (
                            <>
                              <ExpenseSheet storeId={s.id} currency={s.currency} categories={cats} expense={values} defaultStart={today} />
                              <DeleteButton label={`Remove expense ${e.name}`} onDelete={archiveExpenseAction.bind(null, s.id, e.id)} />
                            </>
                          ) : null}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState icon={Receipt} title="No expenses yet">
                Add your Shopify plan, apps and other running costs so net profit reflects them.
              </EmptyState>
            )}
          </Card>
        );
      }}
    </CostPage>
  );
}
