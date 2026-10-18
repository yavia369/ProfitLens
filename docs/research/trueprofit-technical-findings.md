# TrueProfit — Technical Findings

> Labels: **VERIFIED** / **DOCUMENTED** / **INFERRED** / **UNKNOWN** (see `trueprofit-ui-analysis.md`).
> Investigation date: 2026-10-18.

## 1. Investigation method and access boundaries

| Source | What it gave us | Limits |
|---|---|---|
| **REA v6.7.0** (MCP + CLI) driving headless Chromium 141 over CDP | Network inventory, resource origins, framework fingerprints and screenshots of the public marketing site. Evidence IDs: `ev_ed049d2a…d06` (profit-dashboard page network capture, raw JSON kept outside the public repo), `ev_f3e4336b…2a3` (home screenshot). | `app.trueprofit.io` is **not on this environment's network allow-list** (`ERR_TUNNEL_CONNECTION_FAILED`), so the app shell bundle could not be captured. We have no TrueProfit login, so authenticated views are out of scope by design. REA's MCP calls hit the client's 60 s timeout, so the CLI (`npx rea-agents@6.7.0 capture-browser-scenario`) was used instead. |
| **TrueProfit MCP connector** (authorized by the project owner, read-only) on the Luraflo store | Real response shapes for settings, orders, products, customers and ads — the strongest evidence of TrueProfit's **data model and calculation behaviour**. | Connector API ≠ internal API; some aggregate endpoints (`get_profit_summary`, `get_profit_by_date`, `get_ad_costs`) returned empty `data: {}` (INFERRED: the app's install status is `canceled` as of 2026-10-18, see §4), and `get_cogs_return` returned HTTP 502. |
| Owner-supplied dashboard screenshot | Visual layout, KPI set, chart composition. | Static image only. |
| Public help centre, product updates, solution pages | DOCUMENTED behaviour (see `_raw/helpdesk-notes.md`, `_raw/product-pages-notes.md`). | Marketing language; not a spec. |

No authentication, rate limit or access control was bypassed, and no proprietary source code was
downloaded or retained.

## 2. Public web stack — VERIFIED (REA network capture `ev_ed049d2a…`)

- Marketing site `trueprofit.io` is a **Next.js** app (`/_next/static/css/*`, `/_next/static/media/*`).
- Content/media served from `be.trueprofit.io/uploads/*` → INFERRED: a headless CMS (WordPress-style `uploads/` path).
- Third-party scripts: Google Tag Manager, Microsoft Clarity, Hotjar, Cloudflare Web Analytics +
  Turnstile (`challenges.cloudflare.com`), Bing UET, Customer.io (email assets), an OpenAI-hosted
  asset (`bzrcdn.openai.com`).
- The API is fronted by **Cloudflare** (VERIFIED: the 502 error body from the connector is a Cloudflare origin error).
- App shell (`app.trueprofit.io`): UNKNOWN (blocked).
- Connector server: `mcp.trueprofit.io`, OAuth 2.0 "Account-level OAuth exchanged for a Shop
  token" (DOCUMENTED in the connector's SKILL.md).

## 3. Data model observed through the connector — VERIFIED

### 3.1 Shop settings (`get_shop_details`)
```
cogs_rate: "0"                          # default COGS as % of price when a variant has no cost
shipping_rate: "3"                      # default shipping cost
shipping_calculation: { method: "max", type: "item", ship_together: false }
transaction_fees: {
  shopify_payments: { fee_rate: "2.9", flat_fee: "0.3", gateway_fee: "2" },
  other:            { fee_rate: "2.9", flat_fee: "0.3", gateway_fee: "2" } }
shopify_3rd_party_fee: { fee_rate: 2, plan_name: "basic" }   # Shopify's fee for non-Shopify-Payments gateways
has_shopify_payments: true
iana_timezone: "Australia/Canberra", currency: "AUD", money_format: "${{amount}}"
```
Requested Shopify scopes (VERIFIED): `read_products, read_orders, read_all_orders,
read_inventory, read_customers, read_themes, read_returns, read_customer_events, write_pixels,
read_pixels, read_shopify_payments_accounts, read_shopify_payments_payouts,
read_shopify_payments_disputes`.
→ INFERRED: actual Shopify Payments fees come from payouts/balance transactions,
chargebacks from disputes, ad attribution from a web pixel (`write_pixels`) plus customer events,
and returns from the Returns API.

### 3.2 Report configuration (`get_report_config`) — calculation policy toggles
```
accountRefundOnOrderDate: false       # refunds booked on refund date (not back-dated to the order)
accountChargebackOnOrderDate: false
accountSubstituteOnOrderDate: false / allowSubstituteRecordingDate: true
excludeCogsReturn: false              # restocked returns give COGS back
excludeZeroRevenueOrder: false
includeTaxes: true                    # tax counted inside revenue
financialStatus: [authorized, expired, paid, partially_paid, voided, refunded, partially_refunded, pending, unpaid]
defaultDateRange: "today"
profitAnalyticFields / mobileProfitAnalyticFields: user-selected KPI cards
customMetrics: []
```
**Design takeaway:** TrueProfit exposes the same policy questions our financial-model spec must answer.
We will make them explicit, versioned policy settings.

### 3.3 Order record (`list_orders`)
Fields: `id, name, createdAt, processedAt, financialStatus, fulfillmentStatus, gateway,
totalLineItemsPrice, totalDiscounts, totalPrice, totalShippingPrice, totalTax, taxesIncluded,
lineItems[] {variantId, productId, sku, price, quantity, totalDiscount, totalCogs, useCogsRate,
giftCard, requiresShipping}, removedLineItems, cogs {source, totalCogs},
shippingCost {cost, source}, handlingFee {source, total}, transactionFeeDetails[] {name, source,
amount}, transactionFees, adSpend {adSpend, status, finalizedDate}, profit, margin,
customerVisitSource, customerVisitUtm`.

Observed behaviour (VERIFIED from three Luraflo orders):
- **Order profit = totalPrice − COGS − shipping cost − handling − transaction fees (− allocated ad spend).**
  For #1029: 107.91 − 0 − 0 − 0 − 6.21996 = 101.69004 (matches `profit`).
  For #1027: 89.99 − 33.10 − 5.28732 = 51.60268 ✔.
- **Margin = profit / totalPrice** (94.236 % for #1029).
- **Revenue base = `totalPrice`** (after discounts, including shipping charged and tax when `includeTaxes`).
- **Money values are unrounded binary floats** (`"profit":"101.69003926562415"`,
  `"transactionFees":"6.219960734375849"`). → TrueProfit appears to compute with floating
  point. **Our engine will use decimal arithmetic with explicit rounding.**
- **Transaction fees don't match the configured rates:** the configured 2.9 % + 0.30 would give 3.43 on
  107.91, but TrueProfit reports 6.22. A linear fit across two same-day orders gives ≈ 5.35 % +
  0.45. → INFERRED: actual fees from Shopify Payments balance transactions (possibly including
  international/currency-conversion fees) are used when available. **UNKNOWN** exact method.
- **Missing COGS = 0 silently**: line items with `totalCogs: "0"` are treated as zero cost, with no flag
  on the order. #1027 shows `cogs.source: "manual"`, `useCogsRate: true` and an order COGS of 33.10
  while the line COGS is 0 → INFERRED: an order-level manual COGS override exists.
- **Per-order ad spend is allocated by attribution and only "finalized" 30 days later**
  (`status: awaiting`, `finalizedDate` = order date + 30 days), consistent with the documented
  30-day attribution window.

### 3.4 Product / variant record (`list_products`)
`variants[] {id, sku, price, cogs, handling_fee, cogs_history {cj, shopify, trueprofit},
price_history, cogs_edited_at, source}`, product-level `zone_name: "global"`,
`exclude_from_zone`, `calculate_cogs_based_product`, `avg_cogs`.
→ VERIFIED: COGS can differ by **zone** (country groups), has **history per source**
(Shopify `unitCost`, TrueProfit manual, CJ Dropshipping), and a **handling fee per variant**.

### 3.5 Aggregates
- `get_orders_summary` (VERIFIED): `count, lineItemsCount, totalPrice, totalDiscounts,
  totalShippingPrice, totalTax, cogs, shippingCost, handlingFee, transactionFees, adSpend,
  profit, netProfit, margin`.
- `get_order_insights` returned an aggregate block (VERIFIED):
  `total_cogs, total_discounts, total_handling_fee, total_order, total_price,
  total_refunded_price, total_shipping_cost, total_shipping_price, total_shipping_tax,
  total_tax, total_units, transaction_fees, none_profit_cogs, revenue_by_customer_sources[]`.
- `get_customer_overview` (VERIFIED): `cac = totalAdSpent / totalCustomer`
  (checked against the returned values ✔), `ltv = totalSpent / totalCustomer` (✔),
  `ltvCac` as a string such as `"x.xx : 1"`, `repurchaseRate`. → Their LTV is **historical revenue per customer**
  (not margin-based, not predictive), and CAC is **blended** (all ad spend / all customers).

### 3.6 Integrations (`get_connected_platforms`)
Keys (VERIFIED): `amazon, bing, facebook, google, pinterest, snapchat, taboola, tiktok, x,
dropShip[], podAccounts[]`. Luraflo has one Google Ads connection. Gateways (VERIFIED):
"Shopify Payments" and "Other". Channels (VERIFIED): "Online Store", "Other".

## 4. Notable state
`install_status: "canceled"`, `cancel_on: 2026-10-18T09:28:14Z` (VERIFIED): the TrueProfit app
appears to have been uninstalled or cancelled on Luraflo today. This probably explains the empty
aggregate responses. It doesn't affect our build.

## 5. Implications for our architecture (decisions, not observations)

1. Decimal money everywhere; store minor units or `NUMERIC(20,6)`; round only for presentation.
2. Policy toggles (tax in revenue, refund dating, chargeback dating, COGS-return, status filters)
   become a **versioned `FinancialPolicy`** per store, recorded on every computed figure.
3. Cost sources carry **provenance** (`shopify_unit_cost | manual | supplier | default_rate`)
   and **effective dates**, mirroring `cogs_history` but with proper validity intervals.
4. Missing costs are tracked explicitly (`cost_status: missing`), never silently zero.
5. Transaction fees: prefer **actual** fees (Shopify Payments balance transactions / `OrderTransaction.fees`),
   fall back to configured gateway rules, and label which one was used.
6. Ad spend at the store level is exact; per-order/per-product allocation is **modeled** and labelled.
