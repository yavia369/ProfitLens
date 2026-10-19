"use client";

import type { AdsReport, StoreSummary } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Megaphone } from "lucide-react";
import Link from "next/link";
import { PLATFORM_LABEL } from "@/components/ads/platforms";
import { DemoBanner, ReportToolbar } from "@/components/shell/report-toolbar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { formatCount, formatMoney, formatPercent, formatRatio, signOf } from "@/lib/format";
import { useReportParams } from "@/lib/use-report-params";
import { cn } from "@/lib/utils";
import { Stat, StatGrid } from "./stat";

type Unattributed = AdsReport["unattributed"][number];

const REASON: Record<Unattributed["reason"], string> = {
  no_utm: "No UTM parameters",
  not_paid_platform: "Not an ad platform",
  no_campaign_data: "Spend for this platform has no campaigns (entered manually)",
  no_matching_campaign: "No campaign with this name or id",
  ambiguous: "Matches several campaigns",
};

/** ROAS with an explicit "below break-even" marker (icon + text, not colour alone). */
function Roas({ value, below }: { value: string | null; below: boolean | null }) {
  if (value === null) return <span className="text-subtle">—</span>;
  return (
    <span className={cn("inline-flex items-center justify-end gap-1", below && "text-negative")}>
      {below ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
      {formatRatio(value)}
      {below ? <span className="sr-only">(below break-even)</span> : null}
    </span>
  );
}

function Signed({ value, currency }: { value: string | null; currency: string }) {
  if (value === null) return <span className="text-subtle">—</span>;
  const sign = signOf(value);
  return <span className={cn(sign === 1 && "text-positive", sign === -1 && "text-negative")}>{formatMoney(value, currency, { signDisplay: "exceptZero" })}</span>;
}

export function AdvertisingView() {
  const [params, , qs] = useReportParams();
  const q = useQuery({ queryKey: ["advertising", qs], queryFn: () => apiGet<AdsReport>(`/api/reports/advertising?${qs}`), placeholderData: (prev) => prev });
  const stores = useQuery({ queryKey: ["stores"], queryFn: () => apiGet<{ stores: StoreSummary[] }>("/api/stores") });
  const current = stores.data?.stores.find((s) => s.id === params.store);
  const r = q.data;
  const currency = r?.store.currency ?? current?.currency ?? "USD";
  const money = (v: string | null) => formatMoney(v, currency);
  const cogsWarning =
    signOf(r?.totals.revenueMissingCogsShare ?? null) === 1
      ? `${formatPercent(r!.totals.revenueMissingCogsShare)} of revenue has no product cost, so order profit and break-even ROAS are overstated`
      : null;

  return (
    <div>
      <ReportToolbar
        title="Advertising"
        description="Spend per campaign against what it brought in, by two separately labelled attribution methods."
        resolved={r?.range}
        showCompare={false}
        isFetching={q.isFetching}
      />
      {current?.isDemo ? <DemoBanner /> : null}
      {q.isError ? <Alert tone="warning" title="Couldn't load advertising">{(q.error as Error).message}</Alert> : null}
      <Alert title="How to read this page" className="mb-4">
        <strong>Platform-reported</strong> values come from Google or Meta using their own attribution (clicks, views, other devices); platforms can
        each claim the same order. <strong>UTM-modeled</strong> credits an order to a campaign when the UTM tags of the order&apos;s last visit name
        that campaign; orders without UTM tags (for example Google auto-tagging only) are not credited. Neither replaces the store-level figures:
        blended ROAS uses all revenue.
      </Alert>

      {!r ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      ) : r.campaigns.length === 0 && signOf(r.totals.adSpend) === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="No ad spend in this range"
            action={
              <Link href="/settings/stores" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Stores & integrations
              </Link>
            }
          >
            Connect Google Ads under Stores &amp; integrations, or enter spend manually under Costs → Ad spend.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {r.totals.campaignsMissingFx > 0 ? (
            <Alert tone="warning" title="Some spend is in another currency">
              {formatCount(r.totals.campaignsMissingFx)} campaign(s) have spend without an exchange rate, so their spend and ROAS are shown as unknown.
            </Alert>
          ) : null}
          <StatGrid title="Store level" description="All revenue against all ad spend in the range.">
            <Stat label="Ad spend" value={money(r.totals.adSpend)} />
            <Stat label="Blended ROAS" value={formatRatio(r.totals.blendedRoas)} note={`Revenue ${money(r.totals.revenue)} ÷ ad spend`} />
            <Stat label="Break-even ROAS" value={formatRatio(r.totals.breakEvenRoas)} note="Below this, ads cost more than the orders contribute" warning={cogsWarning} />
            <Stat label="Contribution after ads" value={money(r.totals.contributionAfterAds)} warning={cogsWarning} />
            <Stat label="Platform-reported ROAS" value={formatRatio(r.totals.platformRoas)} note={r.totals.platformValue === null ? "No platform reports a value" : `Value ${money(r.totals.platformValue)}`} />
            <Stat label="UTM-modeled ROAS" value={formatRatio(r.totals.utmRoas)} note={`UTM revenue ${money(r.totals.utmRevenue)}`} />
          </StatGrid>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Campaigns</CardTitle>
                <CardDescription>
                  ROAS marked <AlertTriangle className="inline size-3.5 text-negative" aria-hidden /> is below the store&apos;s break-even ROAS of{" "}
                  {formatRatio(r.totals.breakEvenRoas)}. Profit after ads = UTM-modeled order profit − spend.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Campaign</TH>
                    <TH className="text-right">Spend</TH>
                    <TH className="text-right">Platform value</TH>
                    <TH className="text-right">Platform ROAS</TH>
                    <TH className="text-right">UTM orders</TH>
                    <TH className="text-right">UTM revenue</TH>
                    <TH className="text-right">UTM ROAS</TH>
                    <TH className="pr-5 text-right">Profit after ads (UTM)</TH>
                  </TR>
                </THead>
                <TBody>
                  {r.campaigns.map((c) => (
                    <TR key={`${c.platform}|${c.accountName}|${c.campaignId}|${c.source}`}>
                      <TD className="pl-5">
                        <div className="font-medium">{c.campaignName}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                          {PLATFORM_LABEL[c.platform] ?? c.platform} · {c.accountName}
                          {c.source === "manual" ? <Badge variant="outline">Manual</Badge> : null}
                          {c.otherTimezone ? (
                            <Badge variant="warning" title="The ad account reports days in another time zone; they are matched date to date">
                              <Clock aria-hidden /> Other time zone
                            </Badge>
                          ) : null}
                        </div>
                      </TD>
                      <TD className="text-right tabular">{money(c.spend)}</TD>
                      <TD className="text-right tabular">{money(c.platformValue)}</TD>
                      <TD className="text-right tabular">
                        <Roas value={c.platformRoas} below={c.platformBelowBreakEven} />
                      </TD>
                      {c.attributable ? (
                        <>
                          <TD className="text-right tabular">{formatCount(c.utmOrders)}</TD>
                          <TD className="text-right tabular">{money(c.utmRevenue)}</TD>
                          <TD className="text-right tabular">
                            <Roas value={c.utmRoas} below={c.utmBelowBreakEven} />
                          </TD>
                          <TD className="pr-5 text-right tabular">
                            <Signed value={c.utmProfitAfterAds} currency={currency} />
                          </TD>
                        </>
                      ) : (
                        <TD colSpan={4} className="pr-5 text-right text-xs text-subtle">
                          Not applicable: spend without campaigns cannot be matched to UTM tags
                        </TD>
                      )}
                    </TR>
                  ))}
                  {signOf(r.totals.otherAdSpend) !== 0 ? (
                    <TR>
                      <TD className="pl-5">
                        <div className="font-medium">Expenses recorded as ad spend</div>
                        <div className="text-xs text-subtle">Not tied to a campaign</div>
                      </TD>
                      <TD className="text-right tabular">{money(r.totals.otherAdSpend)}</TD>
                      <TD colSpan={6} />
                    </TR>
                  ) : null}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Revenue not credited to a campaign</CardTitle>
                <CardDescription>Orders grouped by the UTM tags of their last visit, with the reason they were not credited. Nothing is guessed.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {r.unattributed.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">Every order in this range was credited to a campaign.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH className="pl-5">Source / medium</TH>
                      <TH>Campaign tag</TH>
                      <TH>Why not credited</TH>
                      <TH className="text-right">Orders</TH>
                      <TH className="text-right">Revenue</TH>
                      <TH className="pr-5 text-right">Order profit</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {r.unattributed.map((g) => (
                      <TR key={`${g.reason}|${g.source}|${g.medium}|${g.campaign}`}>
                        <TD className="pl-5">{g.reason === "no_utm" ? <span className="text-muted-foreground">(none)</span> : `${g.source ?? "—"} / ${g.medium ?? "—"}`}</TD>
                        <TD>{g.campaign ?? <span className="text-subtle">—</span>}</TD>
                        <TD className="text-muted-foreground">{REASON[g.reason]}</TD>
                        <TD className="text-right tabular">{formatCount(g.orders)}</TD>
                        <TD className="text-right tabular">{money(g.revenue)}</TD>
                        <TD className="pr-5 text-right tabular">{money(g.orderProfit)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
