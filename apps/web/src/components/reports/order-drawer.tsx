"use client";

import type { OrderDetail } from "@profitlens/core";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { formatDate, formatInstant, formatMoney, formatPercent } from "@/lib/format";
import { CostStatusBadge, OrderStatusBadge } from "./status-badge";

export function OrderDrawer({ storeId, orderId, currency, timezone, onClose }: { storeId: string; orderId: string | null; currency: string; timezone: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["order", storeId, orderId],
    queryFn: () => apiGet<OrderDetail>(`/api/reports/orders/${encodeURIComponent(orderId!)}?store=${encodeURIComponent(storeId)}`),
    enabled: orderId !== null,
  });
  const o = q.data;
  return (
    <Sheet open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent heading={o ? `Order ${o.name}` : "Order"} description={o ? formatInstant(o.processedAt, timezone) : undefined}>
        {!o ? (
          <div className="flex flex-col gap-3 p-5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-60" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <OrderStatusBadge financial={o.financialStatus} />
              <span className="text-muted-foreground">{o.fulfillmentStatus}</span>
              {!o.isComplete ? <span className="text-warning">· some costs are missing</span> : null}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Items</h3>
              <Table>
                <THead>
                  <TR>
                    <TH>Item</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Unit price</TH>
                    <TH className="text-right">Unit cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {o.lineItems.map((l) => (
                    <TR key={`${l.sku}-${l.title}`}>
                      <TD className="whitespace-normal">
                        <p className="font-medium">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.variantTitle} · {l.sku}
                        </p>
                      </TD>
                      <TD className="text-right tabular">{l.quantity}</TD>
                      <TD className="text-right tabular">{formatMoney(l.unitPrice, currency)}</TD>
                      <TD className="text-right">
                        <span className="tabular">{l.unitCost === null ? "—" : formatMoney(l.unitCost, currency)}</span>
                        <div className="mt-0.5">
                          <CostStatusBadge status={l.costStatus} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">How this order&apos;s profit is calculated</h3>
              <p className="mb-2 text-xs text-muted-foreground">Every line shows its source. Later events (refunds, chargebacks) show the date they were booked.</p>
              <ul className="divide-y rounded-lg border">
                {o.breakdown.map((line, i) => (
                  <li key={`${line.key}-${i}`} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{line.label}</span>
                        {line.status ? <CostStatusBadge status={line.status} /> : null}
                        {line.date ? <span className="text-xs text-subtle">booked {formatDate(line.date)}</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{line.source}</p>
                    </div>
                    <span className="shrink-0 font-medium tabular">{formatMoney(line.amount, currency)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-muted/60 px-3 py-2.5 text-sm font-semibold">
                  <span>Order profit (before ads)</span>
                  <span className="tabular">
                    {formatMoney(o.profit, currency)} <span className="font-normal text-muted-foreground">· {formatPercent(o.margin)} margin</span>
                  </span>
                </li>
              </ul>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt>Taxes collected (liability, not revenue)</dt>
                  <dd className="font-medium text-foreground tabular">{formatMoney(o.memo.taxes, currency)}</dd>
                </div>
                <div>
                  <dt>Gift card sales (deferred, not revenue)</dt>
                  <dd className="font-medium text-foreground tabular">{formatMoney(o.memo.giftCardSales, currency)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-subtle">Ad spend is not allocated to individual orders yet; it is included in store-level net profit.</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
