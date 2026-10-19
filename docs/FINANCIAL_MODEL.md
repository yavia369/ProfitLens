# Financial Model Specification

> Status: Phase 2 specification (v1.0, 2026-10-18). The calculation engine (`packages/finance`)
> must implement exactly this document. Any change needs a DECISIONS entry plus an engine version bump.
> Shopify field semantics are cited from shopify.dev 2026-10 docs. Items marked **[verify]** must be
> confirmed against real orders in Phase 4 (fixture tests capture the confirmed behaviour).
>
> **Implementation (Phase 5, 2026-10-19):** `packages/finance/src/engine` (engine version 1.0.1; 1.1.0 since Phase 8 adds matched processor fees, §5.4 step 5), tests in
> `packages/finance/test/engine.test.ts`. Interpretations and choices made while implementing are recorded as
> D-033…D-040; the ones based on unverified Shopify semantics are D-036 (INFERRED). Verified on Luraflo: revenue
> per day equals Shopify's net sales; `SalesAgreement`/`Sale` handling; refund dating; Shopify Payments fees.
> Still **[verify]**: tax-inclusive stores (Luraflo charges no tax), lost-chargeback refunds, fee tax.

## 0. Principles

1. **Management accounting, not statutory accounting.** All outputs are labelled
   *"Management report — operational estimate, not an accounting statement."*
2. **Event-dated ledger.** Revenue and revenue reversals come from Shopify **sales agreements**
   (order placed, edited, refunded, returned), each with `happenedAt`. This is how Shopify's own
   sales reports work, so our totals can be reconciled against them.
3. **Decimal arithmetic only.** `decimal.js` in TypeScript (precision 34, ROUND_HALF_EVEN by default)
   and `NUMERIC(20,6)` in Postgres. JS `number` is never used for money. Money values cross the
   wire and API boundaries as strings.
4. **Unknown is not zero.** Every cost input has a **status**: `actual | rule | manual | estimated | missing`.
   A `missing` input contributes 0 to the sum but marks the result **incomplete**, and the UI shows it.
5. **Single metric registry.** One definition per metric (§6), used by every screen, export and API.
6. **Traceability.** Every order result carries a trace: inputs, their sources, the cost version and
   rule IDs, the policy version, and the engine version.
7. **Versioned policy.** All judgement calls are `FinancialPolicy` settings (§7). Each saved change
   creates a new version, and results record the version used.

## 1. Time

- Every event has a UTC timestamp. Reporting days are **calendar days in the store's IANA timezone**
  (`Store.ianaTimezone`, synced from Shopify `shop.ianaTimezone`).
- `local_date` is derived at ingestion with `@date-fns/tz` and is recomputed if the store timezone changes.
  DST days have 23 or 25 hours, which is correct as is.
- Range presets are computed in store time: Today, Yesterday, Last 7 days (today − 6 … today),
  Last 30 days, This month (1st … today), Last month, This year (Jan 1 … today), and Custom.
  The **comparison** is the immediately preceding range of equal length, or the same range
  last month / last year (by calendar, clamped to month length).
- The consolidated (multi-store) view buckets each store by **its own** local date.
- **Ad spend** dates are in the ad account's timezone (Google `customer.time_zone`). Daily spend
  cannot be re-split by hour, so account-date *D* maps to store-date *D*. If the timezones
  differ, the metric is labelled `tz_approximation` (documented limitation).

## 2. Currency

- **Store currency** = Shopify shop currency. Order amounts use `shopMoney` from `MoneyBag`.
  Presentment amounts are stored for reference only.
- Inputs in other currencies (ad spend, expenses, manual costs) are converted to store currency
  with the **daily FX rate of the event's local date** (`FxRate`, source recorded). If the rate is
  missing, the nearest *previous* rate within 7 days is used and the item is flagged `fx_stale`.
  With no rate at all, the item is excluded and flagged `fx_missing`, and the result is incomplete.
- Consolidated multi-store reports convert each store's daily totals to the organization's
  reporting currency at that day's rate.
- Rounding: stored values keep source precision (Shopify gives minor units). Computed per-unit
  allocations keep 6 dp. Presentation rounds to the currency's minor units (ISO 4217 exponent)
  with HALF_EVEN. Percentages and ratios are computed from **unrounded** totals and displayed at 2 dp.
  Fee rules that compute a charge per transaction round that charge to minor units with HALF_UP
  (processor convention [verify per gateway]).

## 3. Source facts (inputs)

| Fact | Source | Notes |
|---|---|---|
| Sale ledger entries | `Order.agreements[].sales[]` | `happenedAt` (agreement), `actionType` ORDER/RETURN/UPDATE, `lineType` PRODUCT/SHIPPING/TIP/GIFT_CARD/DUTY/FEE/ADDITIONAL_FEE/ADJUSTMENT/UNKNOWN, `quantity`, `totalAmount` (after taxes & discounts), `totalDiscountAmountBeforeTaxes`, `totalTaxAmount`, `ProductSale.lineItem` |
| Line items | `Order.lineItems` | variant, quantity, `isGiftCard`, `requiresShipping` |
| Refunds | `Order.refunds` | `refundLineItems[].restockType` (RETURN, CANCEL, NO_RESTOCK, LEGACY_RESTOCK), quantities |
| Transactions | `Order.transactions` | `kind` (SALE, CAPTURE, AUTHORIZATION, REFUND, VOID, CHANGE, …), `status`, `gateway`, `amountSet`, `fees[]` (`amount`, `flatFee`, `rate`, `taxAmount`, `type`), Shopify Payments only |
| Disputes | `ShopifyPaymentsDispute` | `amount`, `status`, `type` (CHARGEBACK/INQUIRY), `initiatedAt`, `finalizedOn`, order |
| Variant costs | `VariantCostVersion` (ours) | effective-dated; seeded from `InventoryItem.unitCost` |
| Rules | shipping / handling / gateway-fee rules (ours) | effective-dated |
| Ad spend | Google Ads daily rows, manual entries | per account/campaign/ad group/date |
| Expenses | `Expense` (ours) | fixed / per-order / percentage |

Derived per sale line (Shopify semantics; [verify] the tax-inclusive store case in Phase 4):
- `net_excl_tax = totalAmount − totalTaxAmount` (after discounts, before tax)
- `discount = totalDiscountAmountBeforeTaxes`
- `gross_excl_tax = net_excl_tax + discount`
- `tax = totalTaxAmount`

RETURN/UPDATE sales carry negative (or positive, for an UPDATE that adds items) amounts.
Summing all sales gives the current order value.

## 4. Revenue components (store currency, by event local date)

| Component | Definition |
|---|---|
| **Gross sales** | Σ `gross_excl_tax` of PRODUCT sales with `actionType = ORDER`, plus positive PRODUCT UPDATE sales (items added by edits) |
| **Discounts** | Σ `discount` over the same PRODUCT sales (stored positive, shown as a deduction) |
| **Returns** | −Σ `net_excl_tax` of PRODUCT sales with `actionType = RETURN`, plus negative UPDATE sales (items removed by edits/cancellations). Shown as a deduction |
| **Net product sales** | Gross sales − Discounts − Returns |
| **Shipping charged (net)** | Σ `net_excl_tax` of SHIPPING sales (all actions; includes shipping refunds) |
| **Tips** | Σ TIP sales (net) |
| **Duties, fees & additional fees charged** | Σ DUTY + FEE + ADDITIONAL_FEE sales (net). Default policy: *pass-through*, excluded from revenue, shown as a memo |
| **Taxes collected** | Σ `tax` over all sales. **Never revenue** under the default policy (liability), shown as a memo |
| **Gift card sales** | Σ GIFT_CARD sales. **Not revenue** (deferred liability), shown as a memo. Products later bought *with* a gift card are normal PRODUCT sales, so revenue is recognised on redemption automatically |
| **Adjustments** | Σ ADJUSTMENT + UNKNOWN sales. Included in revenue but flagged `unclassified_sales` in completeness |

**Revenue (recognised)** = Net product sales + Shipping charged + Tips(if policy `tipsAsRevenue`, default true) + Adjustments
(+ Duties/fees if policy `dutiesAndFeesAsRevenue`, default false).

**Total sales (Shopify-comparable)** = Net product sales + Shipping + Duties/fees + Taxes + Tips.
This is used only for reconciliation with Shopify reports.

Order inclusion: test orders are excluded. Orders whose `financialStatus` isn't in the policy's
`includedFinancialStatuses` (default: all except `VOIDED` and `EXPIRED`) are excluded. A
cancelled order is included: its cancellation produces RETURN sales that net it to zero,
and dated reporting shows both sides.

## 5. Cost components

### 5.1 COGS
- For each PRODUCT sale with `actionType = ORDER` (or a positive UPDATE): `qty × landed_unit_cost(variant, order_local_date)`.
- `landed_unit_cost = product_cost + inbound_shipping + handling_per_unit`, taken from the
  `VariantCostVersion` whose `[effective_from, effective_to)` contains the **order's processed local date**.
  Edits use the original order date. That's the cost at the time of sale, not today's cost.
- If no version exists, apply the **fallback** policy: `none` (default; status `missing`) or
  `percent_of_price` (cost = price × pct; status `estimated`).
- **COGS reversal on returns** (RETURN sales, dated at the return): reverse `qty × the same unit cost
  used originally` when the refund line `restockType ∈ policy.cogsReversalRestockTypes`.
  The default is {RETURN, CANCEL}: goods came back or never shipped. NO_RESTOCK keeps the cost (goods lost).
  LEGACY_RESTOCK follows the `restocked` flag.
- Gift cards (`isGiftCard`) have zero COGS. Lines with `requiresShipping = false` keep their COGS (digital goods can have a cost).

### 5.2 Shipping cost (what the merchant pays, not shipping charged)
Priority: order **override** (manual or imported actual) → **rule** effective at the order date → `missing`.
M1 rule types:
- `per_order` flat amount
- `per_item` amount × shippable units
- `first_plus_additional` (first unit A, each extra B)
- `tiered_quantity` (total cost per quantity tier)
- `tiered_weight` (total cost per shipment-weight tier; Σ quantity × the variant's current weight; any shippable
  item with no weight or 0 g makes shipping `missing`, D-048)

Rules can be scoped by destination country set (default: all). Orders with no shippable items
cost 0. Orders **cancelled before fulfilment** get 0 shipping cost when `policy.zeroShippingIfUnfulfilledCancel`
(default true).

### 5.3 Handling
Rule: `per_order` or `per_item`, effective-dated; or per-variant handling inside landed cost.
To avoid double counting, a store uses **one** handling mode (validated at save).

### 5.4 Transaction fees
For each successful money-in transaction (`kind ∈ {SALE, CAPTURE}`, `status = SUCCESS`):
1. **Actual:** if `fees[]` is present (Shopify Payments), fee = Σ `fees.amount`. GST/VAT on fees
   (`fees.taxAmount`) is excluded when `policy.feeTaxRecoverable` (default **false**, i.e. fee tax
   is counted as a cost). Status `actual`.
2. **Rule:** else, if a gateway rule exists (effective at the transaction date), fee = round(amount × rate%) + fixed. Status `rule`.
3. **Shopify third-party fee:** for non-Shopify-Payments gateways, + amount × `store.thirdPartyFeeRate`
   (depends on plan; waived for gateways in the waiver list; 0 for manual gateways). Status `rule`.
4. Otherwise status `missing`, except for manual payment methods, which have 0 fee and status `actual`.
5. **Matched processor fee (Phase 8, D-052):** when Shopify reports no fee and a connected Stripe or PayPal
   payment is matched to the transaction (same amount and currency within ±15 minutes, exactly one candidate,
   uncontested), fee = the processor's fee (converted to store currency at the day's rate when it differs; no
   rate → not used) + the Shopify third-party fee from step 3. Status `actual`, source "Stripe/PayPal fee
   (matched <processor id>)". This takes precedence over step 2; Shopify-reported fees (step 1) are never replaced.
   Unmatched or ambiguous processor payments change nothing (the rule estimate stays) and are listed for review.

Refund transactions don't return fees unless `policy.feesRefundedOnRefund` (default false).
Fee date = transaction processed local date.

### 5.5 Chargebacks
For a dispute with `type = CHARGEBACK` and a final status of lost or accepted:
- `chargeback_loss = dispute.amount − amount already refunded on that order for the same funds`
  (de-duplication; [verify] Shopify refund behaviour on lost disputes in Phase 4).
- `chargeback_fee = dispute fee` (from balance transactions when available, else
  `policy.defaultChargebackFee` with status `rule`).
- Dated at the resolution date (`finalizedOn`) by default, or the order date (`policy.chargebackDating`).
- Revenue is not reduced. These appear as a cost line.

### 5.6 Advertising
- `ad_spend(day) = Σ daily spend rows mapped to the store` (API rows plus manual entries), converted to store currency.
- An ad account maps to exactly one store; if one account serves several stores, a manual
  `split_rule` (percentages) is required (M2).
- **Double-counting guard:** a manual entry for an (account, date) that already has API data is rejected unless it
  is flagged `adjustment`. Expenses with category `marketing` are not ad spend unless the user marks them `isAdSpend`.

### 5.7 Custom expenses
| Type | Recognition |
|---|---|
| `one_time` | Full amount on its date |
| `recurring` (daily/weekly/monthly) | Each occurrence's amount is **spread evenly across the days of its period** (`allocation = spread`, default) or booked on the occurrence date (`allocation = on_date`). Monthly spread uses the actual month length |
| `per_order` | Amount × included orders by order date |
| `percent_of_revenue` / `percent_of_net_sales` / `percent_of_ad_spend` | pct × base, per day |

Expenses have a start date and an optional end date, a currency and a category. They are applied at
store level, or at organization level split evenly across active stores (M2). They are
**fixed** (not variable) unless their type is per-order or a percentage.

## 6. Metric registry (canonical definitions)

Notation: R = Revenue; NPS = Net product sales; O = included orders count (orders with an ORDER
agreement in range); A = ad spend.

| Metric | Formula | Notes |
|---|---|---|
| Revenue | §4 | |
| Gross sales, Discounts, Returns, Net product sales, Shipping charged, Tips, Taxes (memo), Gift card sales (memo) | §4 | |
| COGS | Σ §5.1 (net of reversals) | |
| Gross profit | R − COGS | Standard definition (TrueProfit's differs) |
| Gross margin | Gross profit / R | |
| Fulfilment costs | Shipping cost + Handling | |
| Transaction fees | §5.4 | |
| Variable costs | COGS + Fulfilment + Fees + Chargebacks + per-order expenses + %-of-revenue expenses | |
| **Contribution profit (before ads)** | R − Variable costs | CP₁ |
| Contribution margin (before ads) | CP₁ / R | |
| Ad spend | §5.6 | |
| **Contribution profit (after ads)** | CP₁ − A − %-of-ad-spend expenses | CP₂ |
| Fixed expenses | one-time + recurring | |
| **Net profit** | CP₂ − Fixed expenses | Management estimate |
| Net profit margin | Net profit / R | |
| AOV | R / O | |
| Cost per order | (Variable costs + A + Fixed) / O | |
| Profit per order | Net profit / O | |
| **ROAS (blended)** | R / A | Store-level |
| **MER** | R / (A + expenses flagged `isMarketing`) | Equals blended ROAS when no marketing expenses |
| Platform ROAS | Platform conversion value / platform spend | Labelled *platform-reported* |
| **Break-even ROAS** | R / CP₁ = 1 / CM₁ | ROAS at which CP₂ = 0. Undefined (∞) if CP₁ ≤ 0 |
| **Break-even CPA** | CP₁ / O | Max ad spend per order before contribution after ads turns negative |
| CPA (blended) | A / O | |
| CAC (blended) | A / new customers | Observed; customers defined by first order date in store history |
| Refund rate | Returns / Gross sales | |
| Units sold | Σ ORDER PRODUCT qty − Σ RETURN PRODUCT qty | |

Ratios with a zero denominator return `null` (displayed "—"), never 0 or Infinity.

## 7. FinancialPolicy (per store, versioned) — defaults

```jsonc
{
  "includedFinancialStatuses": ["PENDING","AUTHORIZED","PARTIALLY_PAID","PAID","PARTIALLY_REFUNDED","REFUNDED"],
  "tipsAsRevenue": true,
  "dutiesAndFeesAsRevenue": false,
  "refundDating": "event",              // "event" | "order"
  "chargebackDating": "event",          // "event" | "order"
  "cogsFallback": { "mode": "none" },   // or { "mode": "percent_of_price", "percent": "35" }
  "cogsReversalRestockTypes": ["RETURN","CANCEL"],
  "zeroShippingIfUnfulfilledCancel": true,
  "feeTaxRecoverable": false,
  "feesRefundedOnRefund": false,
  "defaultChargebackFee": null,         // money string or null → missing
  "expenseAllocation": "spread"
}
```
`refundDating = "order"` moves RETURN sales, COGS reversals and refund-related fees onto the original order's date.

## 8. Order-level result & trace

`OrderProfitResult` (stored as `order_profit` with JSON trace):
```
revenue {grossSales, discounts, returns, shipping, tips, adjustments, total}
memo {taxes, giftCardSales, dutiesAndFees}
costs {cogs:{amount,status,lines[]}, shipping:{amount,status,ruleId|overrideId},
       handling, fees:{amount,status,transactions[]}, chargebacks, perOrderExpenses}
contributionBeforeAds, allocatedAdSpend? (M2, labelled model), profit, margin
completeness {complete: bool, missing: [component...], estimated: [component...]}
engineVersion, policyVersion, inputsHash, computedAt
```
Order-level results are by **order** (all events of that order). Dated reports instead aggregate ledger
events by **event date**. Both views are reconcilable: Σ over all dates of the dated view for an order
= that order's lifetime result.

## 9. Aggregation

`daily_store_metrics(store_id, local_date)` holds additive components only (sums and counts).
Ratios are always computed on read from summed components. Store-level costs (ads, fixed expenses,
chargebacks) are added at the daily level, not per order. Completeness counters:
`orders_missing_cogs`, `revenue_missing_cogs`, `orders_missing_shipping`, `fees_estimated_amount`,
`fx_issues`, `unclassified_sales_amount`.

## 9a. Derived analyses (Phase 7)
All are computed in `packages/finance` from the same components and order results; nothing new is stored.
- **Profit bridge** (D-044): Δ net profit = order volume (ΔO × previous AOV) + order value (rest of Δ revenue)
  + Σ cost-line effects (previous − current). Steps sum exactly before display rounding.
- **Store comparison**: P&L lines per store, each over the range in its own time zone; a consolidated total only
  when all stores share a currency (no FX conversion until a rate source exists, B2).
- **Customers** (D-045): observed only. Customers = those with an order included by the policy; guest orders are
  counted apart. New = first order in the range; returning rate = returning ÷ customers ordering in the range;
  repeat rate = customers with 2+ orders to date; LTV = revenue (and revenue − COGS) to date ÷ customers;
  CAC = ad spend ÷ new customers; cohorts by first-order month with cumulative event-dated values. Incomplete
  order history (no `read_all_orders`) is shown as a warning.
- **Advertising** (D-046): platform-reported value/ROAS and UTM-modeled revenue/ROAS side by side, never merged.
  UTM-modeled = the order's last-visit `utm_campaign` equals exactly one campaign name or id of the platform named by
  `utm_source`; everything else is listed as unattributed with the reason. Profit after ads (UTM) = order profit
  before ads − spend; compared with break-even ROAS = revenue ÷ contribution before ads.
- **Product ad-spend allocation** (D-047): optional, labelled estimate; store ad spend split over variants by net
  sales or units (largest remainder at 6 dp, Σ parts = ad spend).

## 10. Reconciliation

Nightly per store, for each of the last 7 closed days (and on demand for any range), compare:
- order count (created in day) vs Shopify `ordersCount` query;
- Σ gross sales, discounts, returns, shipping, taxes vs a recomputation from raw Shopify order payloads.

Differences beyond 0.01 per day create a `reconciliation_issue` and trigger a targeted re-sync.
Ad spend: re-fetch the last 3 days daily (platform restatements) and compare.

## 11. Test matrix (Phase 5 must cover)

discounts (order-level and line-level) · full refund · partial refund · multi-product · variant
costs · multi-currency (presentment ≠ shop) · multiple transactions (split payment, auth+capture) ·
partial fulfilment · chargeback lost / won / accepted · historical COGS change (effective dates) ·
shipping charged vs carrier cost · gift card sale and redemption · tax-inclusive and tax-exclusive
pricing · ad costs (FX, timezone label) · recurring expenses (spread across month boundary, DST) ·
missing costs (incomplete flags) · late-arriving events (refund weeks later) · duplicate webhooks
(idempotency) · retroactive order edits (UPDATE sales) · zero-denominator ratios · rounding
(sum of rounded ≠ rounded sum is handled by summing unrounded values).
