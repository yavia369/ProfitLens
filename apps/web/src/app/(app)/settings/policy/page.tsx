import { getPolicy } from "@profitlens/core/profit";
import { DEFAULT_POLICY, POLICY_DESCRIPTIONS, type FinancialPolicy } from "@profitlens/finance";
import { CostPage } from "@/components/costs/cost-page";
import { PolicyForm } from "@/components/costs/policy-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInstant } from "@/lib/format";
import { costStoreFor } from "@/server/costs";
import { db } from "@/server/db";
import { requireAppSession } from "@/server/session";

export const metadata = { title: "Calculation policy" };

function PolicyList({ policy }: { policy: FinancialPolicy }) {
  const keys = Object.keys(POLICY_DESCRIPTIONS) as (keyof FinancialPolicy)[];
  return (
    <dl className="divide-y rounded-lg border">
      {keys.map((k) => (
        <div key={k} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="font-medium">{POLICY_DESCRIPTIONS[k].label}</dt>
          <dd className="text-muted-foreground">{POLICY_DESCRIPTIONS[k].describe(policy)}</dd>
        </div>
      ))}
    </dl>
  );
}

const ALWAYS = [
  "Taxes collected are a liability, never revenue.",
  "Gift card sales are deferred; revenue is recognised when a gift card is redeemed on a product sale.",
  "Money is calculated with exact decimal arithmetic and rounded only for display.",
  "Days follow the store's timezone.",
];

export default async function PolicyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireAppSession();
  const { store, requestedDemo } = await costStoreFor(session, sp.store);
  const isAdmin = session.scope.role === "owner" || session.scope.role === "admin";
  const data = store ? await getPolicy(db(), session.scope, store.id) : null;

  const always = (
    <Card>
      <CardHeader>
        <CardTitle>Always applied</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <ul className="list-disc space-y-1 pl-5">
          {ALWAYS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <>
      <CostPage
        title="Calculation policy"
        description="How revenue and costs are recognised. Every calculated figure records the policy version used, so changes are traceable."
        store={store}
        requestedDemo={requestedDemo}
        readOnly={!isAdmin}
      >
        {(s) => (
          <>
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Version {data?.version ?? 1}</CardTitle>
                  <CardDescription>{isAdmin ? "Owners and admins can change the policy." : "Only owners and admins can change the policy."}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>{isAdmin ? <PolicyForm storeId={s.id} policy={data?.policy ?? DEFAULT_POLICY} /> : <PolicyList policy={data?.policy ?? DEFAULT_POLICY} />}</CardContent>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              {always}
              <Card>
                <CardHeader>
                  <CardTitle>History</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {data?.history.length ? (
                    <ul className="divide-y rounded-lg border">
                      {data.history.map((h) => (
                        <li key={h.version} className="flex gap-3 px-4 py-2">
                          <span className="font-medium">v{h.version}</span>
                          <span className="text-muted-foreground">
                            {formatInstant(h.createdAt.toISOString(), s.timezone)}
                            {h.userName ? ` · ${h.userName}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Defaults (never changed).</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </CostPage>
      {store ? null : (
        <div className="mt-5 flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Default policy</CardTitle>
                <CardDescription>Applied to every store until changed; also used by the demo store.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <PolicyList policy={DEFAULT_POLICY} />
            </CardContent>
          </Card>
          {always}
        </div>
      )}
    </>
  );
}
