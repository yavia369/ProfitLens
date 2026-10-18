import { DEFAULT_POLICY, POLICY_DESCRIPTIONS, type FinancialPolicy } from "@profitlens/finance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Calculation policy" };

export default function PolicyPage() {
  const keys = Object.keys(POLICY_DESCRIPTIONS) as (keyof FinancialPolicy)[];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Calculation policy</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          How revenue and costs are recognised. Every calculated figure records the policy version used, so changes are traceable.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Default policy (version 1)</CardTitle>
            <CardDescription>Per-store editing with versioning arrives in phase 5.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="divide-y rounded-lg border">
            {keys.map((k) => (
              <div key={k} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="font-medium">{POLICY_DESCRIPTIONS[k].label}</dt>
                <dd className="text-muted-foreground">{POLICY_DESCRIPTIONS[k].describe(DEFAULT_POLICY)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Always applied</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>Taxes collected are a liability, never revenue.</li>
            <li>Gift card sales are deferred; revenue is recognised when a gift card is redeemed on a product sale.</li>
            <li>Money is calculated with exact decimal arithmetic and rounded only for display.</li>
            <li>Days follow the store&apos;s timezone.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
