# TrueProfit — Feature Inventory

> Labels: **V** = VERIFIED (observed: owner screenshot, connector responses, REA capture),
> **D** = DOCUMENTED (official help centre / product pages; citations in `_raw/helpdesk-notes.md`
> as `HC/<article id>` and in `_raw/product-pages-notes.md`), **I** = INFERRED, **U** = UNKNOWN.
> Snapshot date 2026-10-18. TrueProfit changes often (≈ weekly releases v9.x), so treat this
> as point-in-time.

## A. Reports

| # | Feature | Details | Label |
|---|---|---|---|
| A1 | **Dashboard** | KPI cards (up to 5 pinned; Net Profit always pinned since v9.39); "Customize" modal; payment-status filter; sales-channel filter; export. | V (screenshot) + D HC/11330378 |
| A2 | Date picker | Today, Yesterday, Last 7/30 days (optionally including today), This month, Last month, custom; store-timezone "today"; range persists across reports (since Jun 2026). | V + D |
| A3 | Period comparison | Previous period / same period last month / same period last year; coloured deltas. | V ("Compare: Same Period, Last Month") + D |
| A4 | Performance chart | Revenue (bars +), Total Costs (bars −), Net Profit (line), Net Profit Margin (dashed, % axis); Daily/Weekly/Monthly; needs ≥ 2 days. | V + D |
| A5 | Cost breakdown chart | Donut of cost categories. | D (product pages) |
| A6 | Ad spend deep dive | Ad Spend by Channel chart + Ad Spend Summary. | D |
| A7 | Order deep dive | Orders vs Ad Spend per Order chart + Order Summary. | D |
| A8 | Customer summary / other metrics groups | | D |
| A9 | Net Profit breakdown component | Revenue and cost lines composing Net Profit; formula tooltips on every metric (v9.44). | D |
| A10 | **Custom metrics builder** | Formula of built-in metrics with `+ − × ÷ ( )`; format %/currency/number; 30-day preview; not in All-stores view or on mobile; no nesting. | D HC/12856190 |
| A11 | **Product Analytics** (Advanced+) | Per product: revenue, units, COGS, ad spend (needs `tp_productid` URL param), total cost, net profit, NPM, POAS, gross profit, GPM, views, ATC, ATC rate, purchases, conversion rate; show/hide columns; total row; status filter. | D HC/11330258, HC/15162558 |
| A12 | **Orders Report** | Every order incl. refunded/cancelled; columns: order, date, items, revenue, shipping cost, COGS, transaction fees, handling, gross profit, GPM, allocated ad spend ("est." until finalized), net profit; source icons per cost cell; integration-synced cells locked; bulk edit shipping/COGS/handling; CSV export→edit→import round trip. | V (connector order schema) + D HC/15164172, HC/16554887 |
| A13 | **P&L Report** (Advanced+) | Daily/Weekly/Monthly columns; rows Gross Sales, Discounts, Returns, Tax Collected, Shipping Charged → Revenue → COGS, Shipping, Transaction Fees, Ad Spend (expand by channel), Custom Costs (expand by category) → Total Costs → Tips, Gift Card Sales → Gross Profit, Net Profit, NPM; CSV/XLSX export. **No PDF** documented. | D HC/11330268 |
| A14 | **Marketing Attribution** (Enterprise) | Pixel + `tp_*` URL parameters; account → campaign → ad set → ad drill-down; last-click (one credit per order) + assisted purchases; 30-day window (beta); conversion report and per-order conversion journey; net profit / POAS per ad. | D HC/11330282, HC/15173321 + V (connector tool) |
| A15 | **Customer Lifetime Value** | All-time and period overviews (customers, repurchase rate, revenue, LTV, CAC, LTV:CAC); country filter; first-order-month cohort table of cumulative average spend (≤ 6 cohorts); custom costs can be flagged to include in CAC. | D HC/15173499 + V (connector `get_customer_overview`) |
| A16 | Revenue by UTM | First-click source-level revenue series. | V (connector tool description) + D |
| A17 | **Exports** page | Exports from Dashboard, Product Analytics, Orders, P&L, COGS; files kept 7 days. CSV (P&L also XLSX). | D HC/11330278 |
| A18 | Email reports | Daily/weekly/monthly digests; custom email reports (Advanced+). | D HC/11330272 |
| A19 | All-stores view | Consolidated Dashboard + P&L across stores (converted to a base currency at daily rates); free. | D HC/11330347 |

## B. Cost settings

| # | Feature | Details | Label |
|---|---|---|---|
| B1 | **COGS** | Synced from Shopify `cost per item` on install; per-product or per-variant unit cost; **bundle tiers** (largest-first algorithm); **zones** by delivery country (plan-limited 5/10/∞); "COGS = 0" filter + notification; **missing cost = $0**. Current page **removed** effective-dated history, CSV import/export and bulk actions; past orders change only via explicit "Recalculate COGS" (all-time or a date range), skipping orders with manual or integration-synced COGS. | D HC/12381267, HC/16051710, HC/13234734 + V (connector product schema shows `cogs_history` by source and zone fields) |
| B2 | Handling fees | One-time irreversible choice: same amount per order/per item, or per product/variant (CSV). Default $0. | D HC/16065248 |
| B3 | **Shipping costs** | v1: zones (countries/US states) × product groups; quantity tiers (incremental) or weight tiers; "ship all items together"; highest-vs-sum across products; multiply per unit; manual past-order recalculation. v2 beta: product × zone table, store-wide method, initial cost for new products. Default $0. | D HC/11325206, HC/16412210 + V (connector `shipping_calculation`) |
| B4 | Shipping provider sync | Shippo, ShipStation, Shipwire, ShippingEasy, ShipBob, ShipHero; Shopify Shipping label auto-sync (Advanced+). | D |
| B5 | **Transaction fees** | Per-gateway % + fixed (auto-detected gateways); Shopify third-party fee by plan (2 % / 1 % / 0.6 %, with waivers); **actual fees from Shopify** for Shopify Payments, Shop Cash, Shop Pay Installments, PayPal; Stripe via API key; PayPal regional estimates; auto-recalculation on edit. | D HC/11325244, HC/12707607 + V (connector gateway config) |
| B6 | **Custom costs** | Fixed (one-time or recurring daily/weekly/monthly, optional end date) or variable (% of revenue, gross sales, COGS, profit, shipping, total/channel ad spend or ad revenue; flat per order; flat per order tag); categories (5 defaults incl. **Taxes Paid**); category report; "include in LTV:CAC". | D HC/12289182 |
| B7 | AI bill extraction | Upload PNG/JPEG/PDF/CSV invoices; extracted line items reviewed then added as custom costs; duplicate-fee warning. | D HC/13904711 |
| B8 | **Chargebacks** (beta) | Shopify Payments disputes that are Lost or Accepted → Chargeback Loss + Chargeback Fee, deducted from Net Profit only; resolution-date or order-date recording; Shopify Protect excluded; store-total only (no order-level allocation). | D HC/16293283 |
| B9 | Supplier cost sync | CJ, AutoDS, Eprolo, Zopi (dropship); Printify, Printful, Gelato, Gooten, Teelaunch (POD): COGS + shipping (+ handling); synced costs take priority and lock. | D HC/13127685 |

## C. Integrations

| # | Feature | Details | Label |
|---|---|---|---|
| C1 | Shopify | App Store install; scopes incl. `read_all_orders`, Shopify Payments payouts/disputes, pixels, returns, customer events. | V (connector scopes) + D |
| C2 | Ad platforms (12) | Meta, Google, Microsoft, Amazon, TikTok, Snapchat, Pinterest, X, Taboola, AppLovin, AdRoll, Yotpo; OAuth/API key; select ad accounts; sync every 5–15 min **only while a user is logged in**; history back to the later of store creation or 3 years; FX at daily openexchangerates.org rates; campaign include/exclude keyword filters (Ultimate+); ad spend **not manually editable**. | D HC/13127685, HC/13349042 + V (connector platform keys) |
| C3 | Pixel + tracking embed | Shopify web pixel + theme app embed; Chrome extension and in-app URL builder for `tp_*` parameters. | D HC/11330283, HC/11330291 |
| C4 | Payment providers | Stripe (API key), PayPal (via Shopify). | D |
| C5 | TikTok Shop | Separate product/onboarding and metric set. | D |
| C6 | MCP server | Read-only AI access (Enterprise). | V (we used it) + D |
| C7 | Unconnected-platform detection banners | | D (v9.46/9.50) |

## D. Store settings & account

| # | Feature | Details | Label |
|---|---|---|---|
| D1 | **Calculation Preferences** | Exclude taxes collected from net profit; exclude COGS of refunded items; exclude zero-revenue orders; recording date for refunds / chargebacks / substitutions (event vs order date); payment-status filter; default date range. Owner/Admin only. | D HC/11325268 + V (connector `get_report_config`) |
| D2 | Display currency & language | Display-only conversion; EN/FR/ES. | D |
| D3 | Multi-store & members | Store switcher, All-stores view, per-store plan; roles Admin/Editor/Viewer; invite by email. | V (store switcher in screenshot) + D |
| D4 | Notifications & Data Sync Status | Action-required alerts vs sync/recalculation progress hub; "Last updated" indicator. | D |
| D5 | Billing | Shopify billing, 4 plans ($35–$200 per 30 days, order-count tiers + overage), 14-day trial. | D (pricing) |
| D6 | Mobile app | iOS/Android, pinned metrics, widgets, QR sign-in. | D + V ("Get mobile app" button) |
| D7 | In-app AI assistant ("Ask Fin" / sparkle button) | | V (button) + D |
| D8 | Live chat support | | V |

## E. Metrics catalogue (Dashboard) — D HC/11324705 unless noted

Revenue, Gross Sales, Discounts, Returns, Taxes Collected, Shipping Charged, Tips, Gift Card Sales,
Total Costs, COGS, COGS Return, Handling Fees, Shipping Costs, Transaction Fees, Custom Costs,
Taxes Paid, Total Ad Spend, per-channel spend/revenue/ROAS/clicks/impressions/conversions,
Gross Profit, GPM, Net Profit, NPM, Orders, Units Sold, AOV, Average Order Cost, Average Order
Profit, Ad Spend per Order, Purchase Frequency, Total/New Customers, Repurchase Rate, CAC,
Blended ROAS, Total Ad ROAS, POAS, ncROAS, Chargeback Loss, Chargeback Fee.

**Not built in** (D / NOT FOUND): MER and break-even ROAS (only via custom metrics), Net Sales
(as a named metric), contribution margin, break-even CPA, PDF export, configurable timezone,
configurable attribution models.

## F. Documented weaknesses we can improve on

1. Missing COGS silently = $0; only a notification flags it (D, and V on Luraflo).
2. No effective-dated COGS history on the current COGS page; past orders need manual recalculation (D).
3. Inconsistent metric definitions across reports: POAS, revenue treatment of returns, cancelled orders (D).
4. Third-party syncs run only while a user is logged in (D).
5. Float arithmetic in money values (V, connector).
6. Attribution only on the $200 plan; campaign profit depends on pixel + URL parameters (D).
7. Chargebacks only at store-total level, Shopify Payments only (D).
8. No PDF P&L; no explicit "management vs accounting" labelling (D / NOT FOUND).
