# TrueProfit — public documentation research notes (help center + pricing)

Collected: 2026-10-18. Sources: public pages only (no login). Crawled all 11 top-level help-center collections (40 collections/sub-collections total) and all 128 published articles at https://helpdesk.trueprofit.io/en/, plus https://trueprofit.io/pricing.
Out of scope (per coordinator): trueprofit.io/product-updates/*, /solutions/*, /usecase/* (another agent covers them). Blog not crawled.

Conventions
- **[D]** = DOCUMENTED on an official TrueProfit page (URL given next to it).
- **[AMBIG]** = documented, but contradictory, inconsistent or unclear across pages. Read the note.
- **[NOT FOUND]** = searched the public docs and found nothing. Do not assume the feature exists.
- `HC/` = `https://helpdesk.trueprofit.io/en/articles/` (e.g. `HC/11325268` = https://helpdesk.trueprofit.io/en/articles/11325268-how-to-use-calculation-preferences). Each article's full slug URL is listed in Appendix A, so every short cite resolves to a full URL.
- Linked articles that now return 404 (unpublished): 11325087-managing-sources-in-cost-of-goods, 11325165-set-up-custom-costs, 11325302-connect-and-sync-ad-spend-from-your-marketing-channels, 11401310-auto-sync-cost-of-goods-cogs-for-cjdropshipping-lite-mode-cogs, 12538469-profit-optimizer, 14439894-cogs-recalculation-for-past-orders.

---

## 0. Top findings (TL;DR)

1. **Net Profit (default)** = Revenue + Tips + Gift Card Sales − Total Costs − Taxes Collected − Chargeback Loss − Chargeback Fee. Revenue = Gross Sales − Discounts − Returns + Taxes Collected + Shipping Charged (equal to Shopify "Total sales"). Because Revenue includes tax, the default subtracts tax back out. A store-wide checkbox removes the "− Taxes Collected" term. [D] HC/11324705, HC/15561827, HC/11325268
2. **Total Costs** = COGS + Handling Fees + Shipping Costs + Ad Spend + Transaction Fees + Custom Costs. Taxes Paid is a category inside Custom Costs. [D] HC/11324705
3. **Calculation Preferences** (per store, Owner/Admin only):
   - Three checkboxes: Exclude Taxes Collected; Exclude item COGS from refunded orders (the "COGS Return" credit); Exclude zero-revenue orders.
   - Three recording-date choices: Refunds (refund date vs order date), Chargebacks (resolution date vs order date), Substitutions (substitution date vs order date).
   - A Payment status filter, which includes all statuses by default (an "Expired" status was added in v9.48).
   - A default date range.
   [D] HC/11325268, HC/11330293
4. **COGS** comes from three places: Shopify "cost per item" (synced on install), POD/dropshipping integrations, or manual entry. The newest COGS page (called "Version 2" in some articles and "v3" in others):
   - Supports a per-unit cost, bundle-cost tiers (applied largest bundle first) and COGS zones by destination country.
   - Has removed historical/effective-dated COGS, handling fee, CSV import/export and bulk actions.
   - Past orders change only through an explicit "Recalculate COGS" by product and date range. Orders with manual or integration-synced COGS are skipped.
   - A missing cost counts as $0. No default "COGS rate %" exists in the docs.
   [D] HC/12381267, HC/13234734, HC/16051710
5. **Shipping cost**:
   - v1 uses zones (countries or US states), product groups, quantity or weight tiers, "ship all items together", highest-vs-sum across variants, and "multiply per unit".
   - v2 (beta, A/B test) offers per-product/variant columns per zone, one store-wide method (quantity or weight), an "initial shipping cost" for new products, and product groups.
   - The default is $0. Six shipping providers can sync actual costs.
   [D] HC/11325206, HC/11325209, HC/16412210
6. **Transaction fee** = Payment Gateway Fee (% plus a fixed fee per gateway; gateways are auto-detected from orders) + Shopify fee for 3rd-party payments (set by plan: Basic 2%, Grow 1%, Advanced 0.6%, waived in specific cases). Actual fees come from Shopify for Shopify Payments, Shop Cash, PayPal and Shop Pay Installments. Stripe can be connected. PayPal is estimated with published regional rules when fees are not synced. [D] HC/11325244, HC/12707607, HC/13071872
7. **Ads**: 12 ad platforms. OAuth or API key. Sync every 5–15 minutes while the user is logged in. History back to the later of store creation or 3 years ago. Ad spend cannot be edited manually. [D] HC/13127685, HC/11325389
   - **Attribution** requires TrueProfit Pixel (a Shopify app embed) plus `tp_source`/`tp_adid`/`tp_productid` URL parameters. It reports last-click and assisted purchases over a 30-day window (beta). It is Enterprise-only. [D] HC/11330282
   - **Per-order ad spend** is allocated by tracked ad clicks and marked "est." until finalized. [D] HC/16554887
8. **Plans** ($/30-day cycle, billed through Shopify, 14-day trial):

   | Plan | Price | Orders included | Extra order fee | Max surcharge |
   |---|---|---|---|---|
   | Basic | $35 | 300 | $0.30 | $300 |
   | Advanced | $60 | 600 | $0.20 | $500 |
   | Ultimate | $100 | 1,500 | $0.10 | $700 |
   | Enterprise | $200 | 3,500 | $0.07 | $1,000 |

   "Unlimited historical data" is advertised on every plan. [D] https://trueprofit.io/pricing, HC/15855069

---

## 1. Feature list and navigation

### 1.1 Left-nav structure (as referenced across articles)
- [D] **Reports**:
  - Dashboard (HC/11330378)
  - Product Analytics (HC/11330258)
  - Orders Report (HC/15164172, HC/11325271)
  - P&L Report (HC/11330268)
  - Marketing Attribution (HC/11330282)
  - Customer Lifetime Value (HC/11330264)
  - Exports page (HC/11330278)
  - The changelog lists "the 5 report pages (Product Analytics, Orders, P&L, Marketing Attribution, CLV)" (HC/11330293 v9.39).
- [D] **Cost settings / "Configurations"** (the Extract Bill article says "Configurations" > "Custom Costs", HC/13904711):
  - Cost of Goods (HC/12381267)
  - Handling Fees, "right under Cost of Goods" (HC/16065248)
  - Shipping Costs (HC/11325206, HC/13856923)
  - Transaction Fees (HC/11325244)
  - Custom Costs, which includes the Taxes Paid category (HC/12289182, HC/11325259)
  - The Taxes Paid nav entry was removed in v9.21 (HC/11330293).
- [D] **Integrations**. Sub-pages are named:
  - Marketing Channels / "Connect Facebook Account" etc. (HC/13349042)
  - Dropshipping Platforms (HC/11325353)
  - Print-on-demand Services (HC/11331248)
  - Shipping Providers (HC/11325365)
  - Payment Providers (HC/12917436)
  - "Connected Platforms" list (HC/11330293 v9.34)
- [D] **Store Settings**:
  - Calculation Preferences (HC/11325268)
  - Email Reports and Custom Email Reports (HC/11330272)
  - Billing(s) (HC/11330217)
- [D] **Account menu (top right)**:
  - Account Settings (HC/11329853)
  - Display currency and language (HC/11330404)
  - Manage Stores & Members (HC/11329822, HC/11330222)
  - Store switcher dropdown with an "All stores" view (HC/11330347)
  - "Get mobile app" QR code (HC/11330606)
- [D] **Other UI elements**:
  - Notifications bell and a "Data Sync Status" hub (HC/11330293 v9.19)
  - Live chat in the left menu (v7.0)
  - "Ask Fin" in-app assistant (HC/11330268)
- [D] **TikTok Shop** is a separate app/onboarding at tiktokshop.trueprofit.io. It has its own Cost Settings, including Affiliate Commissions (HC/11330575, HC/11330600).
- [D] **TrueProfit MCP server** (beta): https://mcp.trueprofit.io/mcp over OAuth. Works with ChatGPT, Claude and OpenClaw. Admin and Viewer roles only. The session lasts up to 90 days from the last web sign-in (HC/14086381, HC/16390840). The pricing matrix shows MCP as Enterprise-only (https://trueprofit.io/pricing).

### 1.2 Dashboard (HC/11330378, HC/11330293)
- [D] Top KPI area. A "Customize" modal (three-dots menu) lets the user pin up to **5** metrics at the top; other metrics show below. The same three-dots menu has "Filter by Payment statuses" and "Export". (HC/11330378)
- [D] Since v9.39, Net Profit is always pinned at the top. The date picker has built-in period comparison (previous period, same period last month or last year) with up/down colour cues. "Last 7 / 30 days" can include today. The calendar highlights "today" in the store's timezone. (HC/11330293)
- [D] There is a Net Profit breakdown component that shows the revenue and cost lines making up Net Profit (v9.29). Every metric has a tooltip explaining its formula, and cost metrics have a cost-breakdown tooltip (v9.44). (HC/11330293)
- [D] Sections:
  - **Performance Chart**: Net Profit, Net Profit Margin, Revenue, Total Costs. Needs at least 2 days selected.
  - **Cost Breakdown Chart**.
  - **Ad spend deep dive**: Ad Spend by Channel chart plus an Ad Spend Summary.
  - **Order deep dive**: Orders vs Ad Spend Per Order chart plus an Order Summary.
  - **Customer Summary** and **Other metrics**.
  (HC/11330378)
- [D] A "Sales Channels" filter exists. Orders from third-party apps (Gelato, Draft Orders, etc.) fall under an "Other" channel. (HC/11330293 v9.48)
- [D] **Custom Metrics** (since v9.17):
  - The user builds a formula from built-in metrics (inserted with "@") and the operators `+ - * / ( )`.
  - The name must be unique versus built-in metrics. The format is %, currency or Number.
  - It validates live and previews the last 30 days, then is pinned as a dashboard card.
  - Limits: not available in All Stores view or on mobile; cannot nest custom metrics.
  - Examples given: "Net Sales = Total Sales − Return − Taxes", "%COGS of Total Sales", LTGP:CAC, MER.
  (HC/12856190)
- [D] Chargeback Loss and Chargeback Fee are not pinned by default; the user adds them through "Add Metrics". (HC/16293283)

### 1.3 Product Analytics (HC/11330258, HC/15162558)
- [D] Plan: "available in the Advanced plan and above". The pricing matrix agrees (Basic = No). [AMBIG] The Basic plan card on the pricing page lists "Product Analytics" in Basic's bullet list. (https://trueprofit.io/pricing)
- [D] Funnel metrics need TrueProfit Tracking, a Shopify theme **app embed** ("TrueProfit Tracking"). The docs recommend waiting up to 7 days for enough data. (HC/11330258, HC/11330252)
- [D] Columns:
  - Product (name and image)
  - Status filter (Active/Draft/Archived; Unlisted added in v9.50)
  - Revenue, Units Sold, COGS
  - Ad Spend (via TrueProfit parameters)
  - Total Cost, Net Profit, NPM, POAS, Gross Profit, GPM
  - Views, Adds to Cart, ATC Rate, Purchases, Conversion Rate
  - Metrics can be shown or hidden. A Total row is included (v6.0).
  - Older v5.7 notes also mention "Checkout Started" and "Payment Info Submitted".
  (HC/11330258, HC/11330293)
- [D] Digital products are not charged shipping cost in Product Analytics (v9.38). (HC/11330293)

### 1.4 Orders Report (HC/15164172, HC/11325271, HC/16554887)
- [D] Lists **every** synced order, including refunded and cancelled ones. The Dashboard and P&L exclude refunded and cancelled orders from totals, so Orders Report totals can be higher. (HC/15164172, HC/11330268 FAQ in HC/15164254)
- [D] Columns:
  - Order ID, Date, Items
  - Revenue, Shipping Costs, Total COGS, Transaction Fees, Handling Fees
  - Gross Profit, GPM
  - Ad Spend and Net Profit per order (newer)
  (HC/15164172, HC/16554887)
- [D] Cost cells show the source platform icon (Shopify, CJ, Printify, Stripe, PayPal, etc.). Cells synced from an integration are **locked** and cannot be edited. (HC/12381267, HC/11325244, HC/11325346)
- [D] Editing:
  - **Bulk Edit** for Shipping Cost, Total COGS and Handling fee: per order, or "Apply all".
  - **Export → edit CSV → Import** with the same columns and layout.
  (HC/11325271)
- [D] Fee expansion shows a breakdown with links back to Shopify (v9.34). (HC/11330293)

### 1.5 P&L Report (HC/11330268, HC/15164254)
- [D] Plan: Advanced or higher (not Basic). Roles: Viewer or Admin; Editor cannot see it. (HC/11330268)
- [D] There is a date range and a display interval: Daily / Weekly / Monthly. Rows can be expanded, e.g. Total Ad Spend by channel and Custom Cost by category. (HC/11330268)
- [D] Line order:
  1. Gross Sales, Discounts, Returns, Tax Collected, Shipping Charged
  2. Revenue
  3. COGS, Shipping Costs, Transaction Fees
  4. Total Ad Spend (expandable), Taxes Paid, Custom Cost (expandable)
  5. Total Costs
  6. Tips, Gift Card Sales
  7. Gross Profit, Net Profit, NPM
  (HC/11330268)
- [D] Export to CSV or Excel (.xlsx). Files are also stored on the Exports page. (HC/11330268, HC/11330293 v5.7)
- [AMBIG] HC/11330268 still shows "Revenue = … + Custom Revenue" and lists Taxes Paid as a separate line in Total Costs. But Custom Revenue was retired in v9.21, Taxes Paid was removed from the P&L in v9.21, and Taxes Paid now lives inside Custom Costs (HC/11330293, HC/11325259). Treat the current P&L as having no Custom Revenue and no separate Taxes Paid line.

### 1.6 Marketing Attribution (HC/11330282, HC/15173321) — Enterprise only
- [D] Hierarchy: Ad Account → Campaign → Ad group/ad set → Ad, with drill-down. A yellow tooltip appears where URL parameters are missing. (HC/11330282)
- [D] Assisted Purchases and Last-clicked Purchases can be clicked. They open a **Conversion Report** (Order ID, Revenue, Purchase Date, Customer). Each order then has a **Conversion Journey** from the first ad clicked to the final ad. (HC/11330282)
- [D] Attribution window: 30 days by default ("currently in beta"). (HC/11330282)
- [D] Setup: Marketing Attribution page step 3 has a "Build a URL Parameter" builder (beta, A/B test for 50% of Enterprise users from v9.11). (HC/12568948)

### 1.7 Customer Lifetime Value report (HC/11330264, HC/15173499)
- [D] Two sections:
  - **All-time Overview**: All-time Customers, Repurchase Rate, Revenue, LTV, CAC, LTV:CAC.
  - **General Overview** (selected date range): New Customers, Repurchase Rate, Revenue, LTV, CAC, LTV:CAC.
  (HC/15173499)
- [D] Filters: country, and the month range of first-order cohorts. (HC/11330264)
- [D] Cohort table:
  - Rows are first-order-month cohorts with customer counts, up to 6 cohorts at a time.
  - Columns are months since the first order, up to the current month.
  - Values are the cumulative average spend per customer (example: a Sep 2020 cohort of 61 customers went from $36.30 to $42.12 over 4 months).
  - Heat colouring; orange text marks current values.
  (HC/11330264)
- [D] The pricing matrix shows CLV on all plans. (https://trueprofit.io/pricing)

### 1.8 Exports (HC/11330278)
- [D] Export buttons on Dashboard (three-dots), Product Analytics, Orders Report, P&L Report and Cost of Goods. The COGS export holds all-time COGS for all products and variants. The file auto-downloads, and data follows the selected date range. (HC/11330278)
- [D] The **Exports** page in the left menu keeps all export files for **7 days** and can be filtered by page. (HC/11330278, HC/11330293 v6.5)
- [D] Formats: CSV (all); P&L also Excel/.xlsx. [NOT FOUND] PDF export.
- [AMBIG] The COGS export/import was removed on the new COGS page (HC/13234734). Handling Fees per-product mode has its own CSV Export/Import (HC/16065248).

---
## 2. Metric definitions and formulas (EXACT wording where possible)

Primary sources: Dashboard Metric Glossary HC/11324705; P&L glossary HC/15164254; Order Report glossary HC/15164172; Product Analytics glossary HC/15162558; MA glossary HC/15173321; CLV glossary HC/15173499; Net profit explainer HC/15561827; vs-Shopify HC/15457132.

### 2.1 Store-level (Dashboard and P&L)

| Metric | Formula / definition | Data source | Cite |
|---|---|---|---|
| Revenue | "Gross Sales – Discounts – Returns + Taxes Collected + Shipping Charged". "It includes taxes and shipping fees that you charge your customers, and excludes discounts and returns. It is equivalent to Total sales in Shopify." Includes orders of **all payment statuses** by default. | Shopify Orders | [D] HC/11324705, HC/15457132 |
| Gross Sales | "total sales value before subtracting any deductions: Refunds, Discounts, Returns, Chargebacks, Transaction fees, Taxes (depending on the report or metric)" | Shopify Orders | [D] HC/11324705 |
| Discounts | Total reduced through discount codes or promotions | Shopify Orders | [D] HC/11324705 |
| Returns | "total value of orders or products that customers return and get refunded". Taken directly from Shopify's **sales reversals** (refunds, returns, cancellations and order edits). | Shopify Analytics / Sales finance report | [D] HC/11324705, HC/15457132 |
| Taxes Collected | Tax charged to customers at checkout. Pulled from Shopify Analytics; TrueProfit doesn't calculate it. | Shopify Analytics | [D] HC/11324705, HC/11325268 |
| Shipping Charged | Shipping fee charged to customers (income, not cost) | Shopify Analytics | [D] HC/11324705 |
| Tips | Optional checkout amounts. **Added** on top of Revenue in Net/Gross Profit. | Shopify Orders | [D] HC/11324705 |
| Gift Card Sales | Value of gift cards sold. **Added** in Net/Gross Profit. "Gift card sales are not product revenue yet. Revenue is recognized when customers use the gift card." | Shopify Orders | [D] HC/11324705 |
| Total Costs | "Cost of Goods Sold + Handling Fees + Shipping Costs + Ad Spend + Transaction Fees + Custom Costs (Taxes Paid is included in Custom Costs)" | — | [D] HC/11324705 |
| Gross Profit | "Revenue + Tips + Gift Card Sales − COGS − Shipping Costs − Transaction Fees − Handling Fees" | — | [D] HC/11324705, HC/15164254 |
| Gross Profit Margin | Gross Profit / Revenue × 100 | — | [D] HC/11324705 |
| Net Profit (default) | "Revenue + Tips + Gift Card Sales − Total Costs − Taxes Collected − Chargeback Loss − Chargeback Fee" | Shopify + all cost sources | [D] HC/11324705, HC/15561827 |
| Net Profit (Exclude Taxes Collected ticked) | "Revenue + Tips + Gift Card Sales − Total Costs − Chargeback Loss − Chargeback Fee" | — | [D] HC/11325268 |
| Net Profit Margin | Net Profit / Revenue × 100 | — | [D] HC/11324705 |
| COGS (Dashboard/P&L) | "(Cost per unit × Units sold) − Cost of returned units". "Cancelled orders that were never fulfilled are excluded". Bundle cost setup applies. | Manual, Shopify, integrations | [D] HC/11324705 |
| COGS Return | Cost of refunded items credited back on the assumption they are restocked. Total COGS = Product COGS − COGS Return (default). | — | [D] HC/11325268 |
| Handling Fees | Packing/prep cost. Legacy sources: Custom cost (variable per order), Shipping cost (extra weight per unit), COGS (extra unit price). Newer source: Handling Fees page (HC/16065248). | Manual / integrations (Eprolo, Printify, Printful, Gelato, Gooten, Teelaunch sync it, per HC/13127685) | [D] HC/11324705 |
| Shipping Costs | What you pay carriers. Synced from integrations or calculated from shipping settings. | — | [D] HC/11324705 |
| Transaction Fees | "Payment Gateway Fee + Shopify Fee for 3rd-Party Payments" | Shopify Payments, integrations, manual | [D] HC/11324705 |
| Custom Costs | Manual extra costs (software, influencers, rent, salaries, agency) | Custom Costs setup | [D] HC/11324705 |
| Taxes Paid | Taxes the business pays to government. Manually added in Custom Costs, "Taxes Paid" category. | Custom Costs | [D] HC/11324705, HC/11325259 |
| Total Ad Spend | Sum of ad spend across connected channels | Ad platforms | [D] HC/11324705 |
| Orders | Total number of orders placed | Shopify | [D] HC/11324705 |
| Units Sold | Total product units across all orders. v9.52 fix: partial refunds now lower units sold ("based only on actual refunds"). | Shopify | [D] HC/11324705, HC/11330293 |
| AOV | Revenue / Total Orders | — | [D] HC/11324705 |
| Average Order Cost | Total Costs / Total Orders | — | [D] HC/11324705 |
| Average Order Profit | Net Profit / Total Orders | — | [D] HC/11324705 |
| Ad Spend Per Order | Total Ad Spend / Total Orders | — | [D] HC/11324705 |
| Purchase Frequency | Total Orders / Total Unique Customers | — | [D] HC/11324705 |
| Total Customers | New + Returning (unique customers with ≥1 order) | Shopify Customers/Orders | [D] HC/11324705 |
| New Customers | Customers who placed their first order | Shopify Customers | [D] HC/11324705 |
| Repurchase Rate | Repeat Customers / Total Customers × 100. Repeat = 2+ paid orders. | Shopify Customers | [D] HC/11324705 |
| CAC (Dashboard) | Total Ad Spend / Number of New Customers | — | [D] HC/11324705 |
| Blended ROAS | Revenue / Total Ad Spend | — | [D] HC/11324705 |
| Total Ad ROAS | Total Ad Revenue / Total Ad Spend (platform-reported revenue) | — | [D] HC/11324705 |
| Total Ad Revenue | Sum of platform-reported purchase revenue | Ad platforms | [D] HC/11324705 |
| POAS (Dashboard) | "Gross Profit / Total Ad Spend" | — | [D] HC/11324705 — see the AMBIG note below |
| ncROAS | New Customers Revenue / Total Ad Spend | — | [D] HC/11324705 |
| {Channel} Ad Spend / Ad Revenue / ROAS / Clicks / Impressions / Conversions / Swipes | Per channel: FB, Google, Pinterest, Microsoft, Snapchat, TikTok, Taboola, X, Amazon, AppLovin, AdRoll, Yotpo. ROAS = channel Ad Revenue / channel Ad Spend. | Ad platforms | [D] HC/11324705 |
| Chargeback Loss | Order money the bank pulls back after a lost or accepted dispute | Shopify Payments disputes | [D] HC/16293283 |
| Chargeback Fee / Dispute Fee | Flat penalty charged by Shopify Payments | Shopify Payments | [D] HC/16293283 |

Notes and ambiguities
- [AMBIG] **POAS is defined inconsistently.** Dashboard: Gross Profit / Total Ad Spend (HC/11324705). Product Analytics and Marketing Attribution: **Net** Profit / Ad Spend (HC/15162558, HC/15173321).
- [AMBIG] The **Revenue formula wording varies**: "– Returns" (HC/11324705), "– Refunds" (HC/11325292, HC/15173321), and per order "Gross Sales − Discounts + Taxes Collected + Shipping Charged" with no returns (HC/15164172).
- [AMBIG] **Total Cost and Taxes Paid**: some articles still write "+ Taxes Paid" as a separate term (HC/11325292, HC/11330268). Current docs say Taxes Paid sits inside Custom Costs (HC/11325259).
- [D] **Gross vs net in the default formula**: Revenue includes Taxes Collected and Shipping Charged. Net Profit subtracts Taxes Collected by default, so tax nets to 0 effect. Shipping Charged stays as income; shipping cost is a separate expense. (HC/11325268, HC/15457132)
- [NOT FOUND] Built-in **MER** and **Break-even ROAS** metrics. MER is only mentioned as something to build with Custom Metrics (HC/12856190). "Break-even" appears only as LTV:CAC ≈ 1:1 (HC/15173499).
- [NOT FOUND] A metric literally named **"Net Sales"** on Shopify stores. It is given only as a custom metric example (HC/12856190); TikTok Shop does have Net Sales (§2.6).
- [D] **Cost sign**: all cost metrics are displayed as negative values (v5.9, HC/11330293).

### 2.2 Order-level (Orders Report) — HC/15164172, HC/16554887
- [D] Revenue per order = Gross Sales − Discounts + Taxes Collected + Shipping Charged.
- [D] Gross Profit per order = Revenue − (Transaction Fees + Total COGS + Handling Fees + Shipping Costs). GPM = Gross Profit / Revenue × 100.
- [D] **Ad Spend per order** is allocated "based on the ad clicks tracked before the purchase. More clicks mean a larger share of the ad spend".
  - Net Profit per order includes this allocated Ad Spend.
  - An "est." label shows until the amount is finalized.
  - Orders with no tracked clicks get $0 ad spend.
  - Orders placed before install show "—".
  - The Orders Report ad spend total may not match the total elsewhere.
  - Allocated ad spend is unchanged if the order is later refunded or cancelled.
  - All ad platforms must be connected for complete allocation.
  (HC/16554887)
- [AMBIG] HC/15164172 still says "Order-level profit doesn't include ad spend" (older text). HC/16554887 describes the newer per-order Ad Spend and Net Profit columns.

### 2.3 Product-level (Product Analytics) — HC/15162558
- [D] Revenue = (Gross Sales − Discounts) + Tax per product. **Returns are not deducted.**
- [D] Units Sold **includes cancelled orders**. COGS = Cost per unit × Units sold, including cancelled orders, with bundle setup applied.
- [D] Total Costs = COGS + Shipping + Handling + Transaction Fee + Ad Spend. No custom costs, tips or gift cards.
- [D] Net Profit = Revenue − Total Costs. NPM = NP / Revenue × 100. POAS = Net Profit / Ad Spend (0 when no ad spend).
- [D] Gross Profit = Revenue − COGS (COGS only). GPM = GP / Revenue × 100.
- [D] Views and Adds to Cart come from the Pixel. ATC Rate = ATC / Views × 100. Purchases = number of orders containing the product (an order with 3 units counts as 1 purchase). Conversion Rate = Purchases / Views × 100.
- [D] Product ad spend relies on the `tp_productid` URL parameter (HC/11330258).

### 2.4 Marketing Attribution — HC/15173321, HC/11330282
- [D] Ad-platform metrics: Ad Spend, Impressions, Clicks, CTR = Clicks / Impressions × 100, Adds to Cart, Cost per ATC = Spend / ATC, Purchases, Purchase Value, Cost per Purchase = Spend / Purchases, Conversion Rate = Purchases / Clicks × 100.
- [D] TrueProfit-computed metrics:
  - Revenue = "Gross Sales + Tax Collected + Shipping Charged − Discount − Refunds". The full order revenue is credited to the last ad clicked before purchase. This is not the platform's Purchase Value.
  - Total Costs = COGS + Shipping + Handling + Transaction Fee + Ad Spend + Custom Cost.
  - Net Profit = Revenue − Total Cost. NPM. POAS = Net Profit / Ad Spend. ROAS = Revenue / Ad Spend.
- [AMBIG] The MA overview table says the Revenue source is "Shopify orders (**first-click** UTM attribution)" (HC/11330282). The glossary says last click (HC/15173321).
- [AMBIG] It is not documented how Custom Costs are spread across ad channels in MA.
- [D] Double counting: "Each order gets exactly one Direct (last-click) credit"; assisted credits are tracked separately (HC/16244021).

### 2.5 Customer Lifetime Value — HC/15173499, HC/11330264
- [D] All-time Customers = unique customers with ≥1 **paid** order across the store's history.
- [D] All-time Repurchase Rate = Repeat Customers (2+ paid orders) / All-time Customers × 100.
- [D] LTV (all-time) = Total All-time Customer Revenue / All-time Customers.
- [D] CAC (all-time) = Total All-time Ad Spend / Total All-time New Customers.
- [D] LTV:CAC = LTV / CAC. Thresholds: >3:1 healthy, ~1:1 break-even, <1:1 losing.
- [D] Period versions:
  - New Customers = first-ever paid order within the range.
  - Repurchase rate = repeat customers in period / new customers in period.
  - LTV = Revenue in period / Total Customers in period.
  - CAC = Ad Spend in period / New Customers in period.
- [D] Custom costs can be flagged "Include in LTV:CAC ratio". The older CLV article gives CAC = (Total Ad Spend + Total Custom Cost added to LTV:CAC) / Number of First Customers (HC/11330264, HC/12289182). v9.52 says order-tag fixed fees "can be marked as CAC" (HC/11330293).

### 2.6 TikTok Shop metrics (separate product) — HC/11330573, HC/11330580, HC/11330600
- [D] Net Profit = Net Sales − Total Costs.
- [D] Net Sales = Gross Sales − Gross Sales Refund − Seller Discount + Seller Discount Refund. For non-US: Subtotal after seller discounts − Refund subtotal after seller discounts. Cancelled orders are excluded.
- [D] GMV includes cancelled and refunded orders. AOV = Net Sales / Orders.
- [D] Total Costs = COGS + Shipping + TikTok Ad Spend + Transaction Fee + Platform Commission + Referral Fee + Affiliate Commission.
- [D] Seller Shipping Costs = Original Shipping Cost − Shipping Fee (Buyer) + Shipping Return/Refund.
- [D] Transaction Fee (non-US) = (Customer Payment − Refund) × rate.
- [D] Platform Commission (non-US) = (Item Price − Seller Discount) × rate.
- [D] Referral Fee (US) = rate × (Customer Payment + Platform Discount − Tax).
- [D] Affiliate Commission = (Product Price excl. tax − Seller Discount) × rate. For unsettled orders it is estimated with a rate = Total Affiliate Commissions / Total Net Sales. The user picks one of 3 precomputed rates or a custom rate; the default is 0%.
- [D] Settlement Amount = Net Sales − Total Fees + Adjustments.
- [D] Order-level Gross Profit = Net Sales − COGS − Seller Shipping − Referral − Transaction Fee.
- [D] Market selection at onboarding: US vs non-US (HC/11330575).

### 2.7 Configurable toggles affecting metrics (Calculation Preferences) — HC/11325268
Location: Store Settings → Calculation Preferences. Owner/Admin only. Per store, not per user. Applies to Dashboard, all reports, mobile and email reports. Nothing applies until Save.
1. [D] **Profit calculation rules** (checkboxes, all unticked by default):
   - "Exclude Taxes Collected metric from Net Profit formula". Example: $100 product + $10 tax, $40 cost → $60 unticked vs $70 ticked.
   - "Exclude item's COGS from refunded orders", i.e. drop the COGS Return credit. Example: full refund of a $100 sale with $40 cost → NP $0 unticked vs −$40 ticked.
   - "Exclude zero-revenue orders". For $0 orders: COGS is no longer counted on the Dashboard; shipping cost and transaction fees are still shown; the orders are not counted in Order Count. The Orders Report still shows the full breakdown.
2. [D] **Recording date** (a two-option choice for each):
   - **Refunds**: Refund date (default, matches Shopify) or Order date. Order date restates Returns, Revenue, COGS Return, NP, NPM, ROAS and POAS in the order's period.
   - **Chargeback Loss & Fee**: Resolution date (default) or Order date. FX always uses the rate from the resolution date (HC/16293283).
   - **Substitution** (order edits before fulfilment): Substitution date (default) or Order date. Order date folds the final value onto the order date and removes the reversal; added v9.51.
   - Saving with Order date recalculates the affected past reports.
3. [D] **Default settings**:
   - **Payment status** multi-select. The default is all of: paid, pending, partially paid, refunded, partially refunded, authorized, voided, unpaid. "Expired" can be ticked or unticked (v9.48). The filter also appears on Dashboard, Order Report and Onboarding. It affects Dashboard, Orders Report, mobile and email.
   - **Default date range**: Today / Yesterday / Last 7 Days / Last 30 Days / This Month.
   (HC/11325268, HC/11330415, HC/11330293)
- [AMBIG] HC/15457132 calls the refund setting "Calculate Returns on the same day" (older label for Refunds → Order date).
- [NOT FOUND] A toggle to exclude shipping charged, tips or gift cards from revenue. [NOT FOUND] A toggle for discounts. [NOT FOUND] Separate order financial-status rules beyond the Payment status filter.
- [D] Sales-channel filter exists on the Dashboard (HC/11330293 v9.48).

---

## 3. COGS management

### 3.1 Sources and import on install
- [D] On install, TrueProfit syncs Shopify **Cost per item** per variant (HC/11325096). Connecting Shopify or a POD/dropshipping integration auto-syncs cost to the COGS page (HC/12381267).
- [D] Each cost-per-unit cell shows the last-updated time, from→to change, and source (Shopify, POD platform, Dropshipping, manual) with icons. The old "Cost source" column was removed; editing auto-switches the source (HC/12381267, HC/13234734).
- [D] Sale prices always come from Shopify and cannot be edited in TrueProfit (HC/11325288).
- [D] v9.52: a manual COGS edit is no longer overwritten by a later Shopify sync carrying an older timestamp. Conflict handling is timestamp-based (HC/11330293).
- [D] Up to **250 variants per product** are supported (was 100) (v9.42, HC/11330293).

### 3.2 Versions (important for scope)
- **v1 (legacy)** — HC/11325035, HC/11325027, HC/11325050, HC/11325096, HC/11325110:
  - [D] "Set to Level" toggle: Product vs Variant.
  - [D] Quantity break, using **per-unit** tier costs (e.g. 1 = $9, 2 = $7.50, 3 = $6.66, 4+ = $6.25).
  - [D] **Historical COGS periods** (unlimited periods, start dates, duplicate period).
  - [D] COGS **Zones**.
  - [D] CSV Export/Import (dot decimals; don't change columns; the Sale price column is ignored).
  - [D] Bulk actions: change source, edit COGS, edit handling fee.
  - [D] Handling fee per product.
  - [D] Manual "Re-calculate product past orders" for selected products.
- **New page ("Version 2" in HC/12381267 and HC/16051710; "v3"/"Version 3" in HC/11330293, HC/16065248 and HC/16388713)**:
  - [D] Cost per unit at product level (applies to all variants) or variant level.
  - [D] Product rows show a range when variant costs differ (e.g. $7.2–$9.2).
  - [D] **Bundle Cost** tiers entered as **total** cost per quantity, starting at 2 units. Set at product level OR variant level, not both.
  - [D] Bundle algorithm: largest bundle first, then the next largest, until all units are covered; a remaining single unit uses the cost per unit. Example: 45 units with tiers 2 = $10, 3 = $20, 4 = $50 and unit $5 → 10×4 + 1×3 + 1×2 = $530. (HC/12381267)
  - [AMBIG] The doc also says "Note: If the final remainder is 1 unit", implying only a remainder of 1 falls back to unit cost. It is not documented what happens if tiers don't divide evenly otherwise. The changelog links a third-party "dynamic programming" bundle calculator (HC/11330293 v9.18).
  - [D] COGS Zones carry over.
  - [D] Filters: product status, COGS = 0.
  - [D] **Removed**: historical COGS, handling fee in COGS, manual re-calc button (replaced), Set-to-level toggle, Cost source column, import/export/bulk actions (HC/13234734).
- [D] Changelog timeline (HC/11330293): COGS v2 experiment Oct 2025 (v9.9); v2→v3 adds variant-level bundles (v9.18, Dec 2025); v1→v3 migration of 187 users (v9.25, Feb 2026); v9.2 (Jul 2025) changed v1 quantity break "from bundle pricing to volume pricing".

### 3.3 COGS by zone / country
- [D] Create a zone (name + countries) and add products. Products not in a custom zone, and countries not in any zone, use the default **Worldwide** zone. Warning: "Add all products in your store to this zone" overwrites old COGS with the Worldwide value (HC/11325050, HC/16413032).
- [D] The zone is based on the order's **delivery destination** (HC/11325050). CJ COGS sync is zone-aware (v7.4) (HC/11330293).
- [D] Zone limits by plan: Basic up to 5, Advanced up to 10, Ultimate and Enterprise unlimited (https://trueprofit.io/pricing).

### 3.4 History / effective dates / recalculation
- [D] New page: there is one current COGS. "By default, TrueProfit applies your latest COGS to new orders only. Past orders stay unchanged" until the user runs **Recalculate COGS** (HC/16051710, v9.37).
  - The picker lists products with pending updates (variant changes surface the parent product); none are selected by default.
  - Effective date: **All time** (default) or **Custom date range** (no future dates).
  - Progress shows in "Report Update Progress" and "Data Sync Status".
  - Failed products are not auto-retried and stay visible for 24 hours.
  - Products being recalculated are locked from concurrent recalculation.
- [D] **Protected orders**: if an order holds COGS that was manually edited in the Orders Report or synced directly from a dropshipping/POD platform, the **entire order** is skipped (HC/16051710).
- [D] Order-level COGS lock: once an order is fulfilled with COGS > 0 and comes from an integrated platform, its Total COGS is auto-updated to the latest values and then locked. A later disconnect doesn't unlock it. Non-integrated orders stay editable (HC/12381267).
- [AMBIG] The migration notice (HC/13234734) said that after migration "if you update costs and click Save … TrueProfit will auto-recalculate—and those changes can affect past orders". This conflicts with the later v9.37 "new orders only" behaviour (HC/11330293). The latest docs (HC/16051710) say new orders only.
- [D] Workaround to preserve history: Orders Report export then re-import, to freeze per-order COGS (HC/13234734).

### 3.5 Handling fees (new page, "COGS V3" stores) — HC/16065248
- [D] One-time onboarding choice that **can't be changed later**:
  - (1) **Same amount** per order (default) or per item (× quantity), with a live 3-item example.
  - (2) **Different amount per product/variant**: a product-level value overwrites its variants; a range is shown; unset = $0; CSV Export/Import.
- [D] Default $0 when unset. Applies going forward: to new orders, and to existing orders recalculated by an external event such as a Shopify edit, which takes the then-active setting.
- [D] Legacy alternative: a per-order fee as a Custom Cost "Variable cost → USD/order" (HC/13234734).

### 3.6 Supplier integrations (COGS / shipping / handling sync) — HC/13127685
Sync rules: "Generally, TrueProfit will sync data from the last 3 years since the installation date". Syncs run **only while the user is logged in** (web, and mobile since v9.18).

| Platform | Type | Method | Frequency | Status rules | Data |
|---|---|---|---|---|---|
| CJ Dropshipping | Dropship | Email + API key (only the part after the last "@" of `{UserID}@api@{key}`) | every 2 h | Sync: CREATED, IN_CART, UN_PAID, UN_SHIPPED, SHIPPED, DELIVERED, OTHER. Exclude CANCELLED, TRASH. | Order info, product info, COGS, shipping |
| AutoDS | Dropship | API key | 1 h | STAND_BY, ORDERED, SHIPPED, DELIVERED. Not Failed/Canceled/Unmonitored (HC/11982788). | COGS, shipping |
| Eprolo | Dropship | API key | 15 min | SHIPPED only | + handling fee |
| Zopi | Dropship | One-click | 2 h | Fulfilled by Zopi | COGS, shipping |
| Printify | POD | API key | 15 min | SHIPPED/DELIVERED (HC/11363299) | + handling |
| Printful | POD | OAuth | 1 h | — | + handling |
| Gelato | POD | API key | 1 h | SHIPPED/DELIVERED (HC/11389433) | + handling |
| Gooten | POD | API key | 1 h | — | + handling |
| Teelaunch | POD | API key | 5 min | — | + handling |

- [D] Matching: synced costs are **prioritized** over settings when a Shopify order matches the platform order. They show an icon and become non-editable (HC/11325353, HC/11325346). Account email must match the Shopify store (HC/11363299 etc.). CJ: wait at least 5 minutes after a wrong key (CJ limitation) (HC/11325346).
- [D] "Request a platform" voting form (HC/11325353).
- [D] "Lite Mode" (auto-sync of latest CJ COGS) launched v8.5 and was deprecated in v8.9 (HC/11330293).
- [D] v9.46/v9.50: the app **detects unconnected platforms** in use (payment, shipping, POD, dropshipping, marketing) and shows a dismissible connect banner (HC/11330293).

### 3.7 CSV import
- [D] v1: COGS CSV via Export template → fill COGS (and Handling Fee) → Import; progress in the notification bell (HC/11325096).
- [D] Orders Report CSV round-trip for Shipping Cost, Total COGS and Handling Fees (HC/11325271).
- [D] Handling-fee per-product CSV (HC/16065248).
- [D] COGS CSV was removed on the new page (HC/13234734).

### 3.8 Missing-cost behaviour / defaults
- [D] Missing COGS = 0. A notification appears for active products with COGS = 0, with a "Review and update costs" action and a "COGS = 0" filter. Missing COGS inflates Net Profit (HC/12381267, HC/15919801).
- [D] COGS excludes shipping and freight; add inbound freight into the unit cost (HC/12381267).
- [NOT FOUND] A default "COGS rate %" (e.g. assume X% of price when cost is missing). The closest is a Custom Cost "Variable cost → % of …" (§6).
- [D] Deleted products lingering in COGS need support help (HC/11325285). Fixed for the reinstall case in v9.46 (HC/11330293).

---
## 4. Shipping cost settings

### 4.1 Version 1 (legacy / most users) — HC/11325206, HC/11325209, HC/11325214, HC/11325219
- [D] **Zones**:
  - A Default Zone covers every country not placed in a custom zone.
  - Custom Zones group countries; US **states** can be added individually.
  - A country can belong to only one zone. Zones can be duplicated.
- [D] **Product groups** per zone:
  - A Default Product group exists in the Default Zone.
  - A zone can hold several groups; a product can be in only one group per zone.
  - Groups can be filtered and support "Select all available products".
- [D] **Rule per group**:
  - **Quantity-based**: a flat cost, or "Add quantity break" tiers. The value entered is the **incremental** cost per unit at each tier. Example: totals 1 = $9, 2 = $15, 3 = $20, 4+ = $25 are entered as 9, 6, 5, 5, so 5 units = $30.
  - **Weight-based**: "Add weight break" tiers on the order's total weight, excluding package weight. Product weight comes from Shopify.
- [D] **"Ship all items together"** checkbox:
  - Quantity rule: treats all products in the group as one product when counting units.
  - Weight rule: uses the whole order weight as one package.
  - Unchecked: each product is counted separately.
- [D] **Calculation settings** (store-wide):
  - "Calculation rules in an order (for different products)": **Use the highest shipping fee of any variant** (A $3 + B $4 → $4) or **Sum shipping fees of all variants** (→ $7).
  - "**Multiply shipping cost per unit purchased**": 2 × $3 → $6 if on, $3 if off. It must be on to use quantity breaks.
  - An Example order preview shows the result.
- [D] Default shipping cost on install = **0**, quantity-based, Default group in the Default zone (HC/11325209, HC/11325277).
- [D] Changes apply to future orders only until "Re-calculate past orders" is clicked (HC/11325206, HC/11325281).
- [AMBIG] FAQ HC/16307234 says "Whenever you update a rule, TrueProfit automatically recalculates shipping cost for affected orders". This contradicts the manual recalc in the v1 docs.

### 4.2 Version 2 (beta; A/B test for 50% of new users from v9.27, Mar 2026) — HC/13856923, HC/16412210, HC/16412281, HC/16412341
- [D] **Mini onboarding** asks four things:
  - How the supplier charges: per item (quantity) or by weight.
  - Whether some products share a cost (pick them).
  - Where you ship (Worldwide or specific regions).
  - An initial shipping cost for new products.
- [D] **Main view**: a table of products/variants × zone columns. "Default (Worldwide)" is the first column; each custom zone adds a column. Inline hover-edit of values and zone names; drag to scroll horizontally.
- [D] **Settings**:
  - **Calculation method** (store-wide): Quantity-based, entered as **total** cost per quantity (1 = $10, 2 = $15, 3 = $20), or Weight-based ranges. **Switching the method resets all shipping costs to 0** for all products and orders.
  - **Initial shipping cost** for newly created products, so they don't start at $0. Existing products are unaffected.
  - **Custom shipping zones**.
- [D] **Product groups**: products sharing one tier table, with costs per zone. Within an order, each product is priced separately on its own quantity, then summed. Example tiers 1 = $10, 2 = $15, 3 = $20: 1 Snowboard + 1 Gift Card + 1 Ski Wax = $30; 2 Snowboards + 1 Gift Card = $25; 3 Ski Wax = $20.
  - [AMBIG] This differs from v1's "ship all items together".

### 4.3 Other shipping sources
- [D] **Shipping providers** (all plans): Shippo (API token), ShipStation (API key + secret, or "V2" secret only; needs the ShipStation **Standard** plan or higher), Shipwire (username/password), ShippingEasy (key + secret; not usable on its free trial), ShipBob (PAT token), ShipHero (login, or third-party refresh token).
  - The provider must already be connected to the Shopify store.
  - The user selects the provider's currency; costs are auto-converted to store currency.
  - Sync every 5 minutes while logged in.
  (HC/11325365, HC/13127685)
- [D] **Shopify Shipping Auto-Sync**: "automatically syncs your shipping fees for new orders fulfilled by Shopify Shipping (applies to new orders only)". Advanced plan and up. (https://trueprofit.io/pricing)
- [D] Shopify shipping **rates** (charged to the customer) cannot be imported as costs (HC/11325275).
- [D] POD and dropshipping platforms also sync shipping cost (§3.6).
- [AMBIG] HC/15919801 says shipping cost is "Synced when you setup based on your Shipping Profiles". "Shipping Profiles" here appears to mean TrueProfit's own settings, not Shopify shipping profiles.
- [D] Free shipping: set the Default zone to 0 and delete the custom zones (HC/11325277).
- [NOT FOUND] Per-order flat-shipping mode separate from the tiers (achievable with a single quantity tier and "multiply" off). [NOT FOUND] Sync of carrier-label cost from fulfillment services beyond the providers listed.

---

## 5. Transaction fee settings — HC/11325244, HC/12707607, HC/12678889, HC/13071872, HC/12917436

- [D] Each order's fee = **Payment Gateway Fee + Shopify Fee for 3rd-Party Payments**.
- [D] **Gateway list**:
  - Auto-detected from Shopify orders; new gateways are added automatically.
  - Per gateway: **% fee + fixed fee per transaction**, edited in "Rates & Fees".
  - Editing triggers automatic recalculation of affected orders under the revamped page (v9.22, Jan 2026). [AMBIG] The older FAQ HC/11325281 says a manual "Recalculate past orders" is needed.
- [D] Manual payment methods are imported with fee = 0 (HC/11325244).
- [D] **Actual fees from Shopify** (no calculation by TrueProfit):
  - Shopify Payments and Shop Cash ("records the exact fee calculated by Shopify"). The Shop Cash fix is in v9.51.
  - Shop Pay Installments has its own category (v9.36 / v9.43).
  - **PayPal**: fees are pulled from Shopify; no PayPal connection is needed; they are not manually editable; past orders are updated too (v9.34).
  (HC/11325244, HC/13071872, HC/11330293)
- [D] **Stripe**: connect with a restricted API key. Syncs every 3 hours. Matched orders show the Stripe icon and fees lock (HC/12917436, HC/13127685).
- [D] **PayPal estimates** when not synced ("Fees are estimated based on PayPal rule. Connect PayPal for precise fees."). Fixed fees come from per-currency tables in HC/12707607. Region is chosen by the buyer's billing country.
  - EU: 2.49% + fixed fee. International add-on: EEA +0, UK +1.29%, US/CA +1.99%, other +2.99%.
  - US: 3.49% + $0.49. International +1.50%.
  - UK: 2.9% + £0.30. International: EEA +1.29%, RoW +1.99%.
  - Other markets use the EU schedule.
  (HC/12707607)
- [D] **Shopify 3rd-party fee** by plan (editable in the same place):
  - Basic 2%, Grow 1%, Advanced 0.6% (Shopify states 0.5–2%).
  - Not charged on Shopify Payments, Shop Cash, Shop Pay, Shop Pay Installments, manual methods, or PayPal Express **when Shopify Payments is active**.
  - On Shopify Plus with Shopify Payments active, the fee is 0% on all providers.
  - Detecting Shopify Payments needs an extra read-only permission (v9.33).
  (HC/11325244, HC/11330293)
- [D] Reference fee links for 20 gateways (PayPal, Stripe, Authorize.Net, Adyen, Klarna, Afterpay, Amazon Pay, Moneris, PayU, Mollie, Eway, Affirm, Sezzle, Zip, Opayo, Windcave, Checkout.com, Airwallex, NMI, Reach) (HC/12678889).
- [D] Integrated fees lock in the Orders Report; manual rate edits don't override them (HC/11325244).
- [D] Chargebacks are Shopify Payments only (§2.1, HC/16293283).
  - Counted only when finalized as Lost or Accepted. Shopify Protect cases are excluded.
  - Not handled: partial-chargeback item breakdown, reversals, open-dispute view, order-level allocation ("shown as a store total").
  - Requires a "Grant access" permission. Beta.
- [NOT FOUND] Per-card-type or per-country rate rules for non-PayPal gateways (one %+fixed per gateway).

---

## 6. Custom costs — HC/12289182, HC/11325259, HC/11325290, HC/13904711, HC/11330293

- [D] **Fixed cost**:
  - Name, currency, amount.
  - One-time (start date = end date) or recurring with "Repeat this cost" every **1 day / week / month**. An ongoing cost has no end date.
  - Category, optional "Include in LTV:CAC ratio".
  (HC/12289182)
  - [AMBIG] Yearly recurrence is not documented for Shopify. The AI bill extractor offers Daily/Weekly/Monthly/No Repeat (HC/13904711).
  - TikTok Shop's older UI says the total "will be divided evenly within the date range you selected" (HC/11330610), which implies proration. Proration is not documented for Shopify.
- [D] **Variable cost**: a percentage of a selected metric over a date range. Documented bases:
  - % Revenue, % Facebook (ad spend), % Google Ads, % COGS, % TikTok Ad Spend (TikTok Shop)
  - "% of Profit" (bug fix v9.43)
  - From v9.42: % of Gross Sales, % of Shipping Cost, % of Total Ad Spend, % of Total Ad Revenue, % of Ad Revenue for a specific channel. Formulas are grouped into categories with search.
  - "USD/order" (per-order flat) (HC/13234734).
  - v9.52: "{currency}/Order by Order Tag": a flat amount charged once per order carrying one chosen Shopify tag.
  (HC/12289182, HC/11330293, HC/13234734)
- [D] **Order-tag targeting**: a variable cost can be limited to orders with a chosen Shopify order tag. With no tag, it applies to all orders as % Revenue (HC/11325290). Fixed per-tag amounts were added in v9.52.
- [D] Negative base metric → the variable cost is clamped to 0 (v9.18) (HC/11330293).
- [D] **Categories**: 5 defaults (Agency fees, Office expenses, Labor cost, Marketing, Taxes Paid) plus user-created ones. A Categories tab shows a report by category. In the P&L, Custom Cost expands by category (HC/12289182, HC/11330268).
- [D] **Taxes Paid** = a Custom Cost category. Fixed, or variable "custom tax %" of Revenue/COGS/Profit. Migrated from a standalone page in v9.16/v9.21 (HC/11325259).
- [D] **Extract Bill with AI**:
  - Upload PNG, JPEG, PDF or CSV (e.g. Shopify or Amazon invoices).
  - AI extracts the line items into a review table: delete rows, fill missing dates (required), assign category, adjust amounts, set repeat.
  - Then "Add to Custom Costs" in one batch (~100 rows).
  - A duplicate-fee warning flags overlap with synced transaction fees.
  (HC/13904711, v9.45)
- [D] Sort by start or end date (v9.41). Fixed and variable were merged into one page (v9.13).
- [D] **Allocation**: [AMBIG] Day-level allocation of recurring and monthly costs is not documented. It is also not documented how custom costs are split per product (they are excluded from Product Analytics) or per channel (they are included in the MA Total Costs formula).
- [D] Ad spend cannot be edited manually; use a Custom Cost instead (HC/11325389).
- [D] Custom Revenue (non-Shopify income) existed as an experiment in v9.13 and was retired in v9.21 (HC/11330293).

---

## 7. Ad integrations, ad spend and attribution

### 7.1 Ad platforms (12) — HC/11324705, HC/13127685

| Platform | Auth | Sync interval (while logged in) | Data pulled |
|---|---|---|---|
| Facebook/Meta Ads | OAuth | 5 min | account, campaign, spend, impressions, clicks, purchase value (ad revenue), ROAS |
| Google Ads | OAuth (all permission boxes must be ticked) | 10 min | account, campaign, spend, impr., clicks, ad revenue, ROAS, conversions |
| Microsoft (Bing) Ads | OAuth | 10 min | account, campaign, spend, impr., clicks. PMax since v9.29. |
| Amazon Ads | OAuth | 10 min | spend, ROAS, ad revenue |
| TikTok Ads | OAuth | 10 min (HC/11330638 says 15 min for TikTok Shop) | account, campaign, spend, impr., clicks, ad revenue, ROAS |
| Snapchat | OAuth | 10 min | account, campaign, spend, impr., swipes, ad revenue, ROAS. Inactive accounts not synced (v9.43). |
| Pinterest | OAuth | 10 min | account, campaign, spend, ad revenue, ROAS. Integration was updated, so reconnect required. |
| X (Twitter) | OAuth | 10 min | account, campaign, spend, impr., clicks, conversions |
| Taboola | API key | 15 min | account, campaign, spend, impr., clicks |
| AppLovin | API key | 10 min | spend, clicks, impr. |
| AdRoll | OAuth | 10 min | spend, clicks, impr. |
| Yotpo (email/SMS) | API key | 10 min | account, campaign, spend, impr., clicks, conversions, ad revenue, ROAS |

- [D] **Connect flow**: connect profile → "Select Ad Accounts" → "Sync Ad Spend". Multiple profiles per channel are possible. Per-account "Stop Syncing" and disconnect from the 3-dots menu. The integration dialog shows the last sync time and duration (v9.26). (HC/11325313, HC/13349042, HC/11330293)
- [D] **History**: "from either the date your store was created, or up to the last 3 years, whichever is more recent" (HC/11325313, HC/11325323).
- [D] Accounts per marketing channel by plan: 1 / 2 / 5 / 10 (Basic / Advanced / Ultimate / Enterprise) (https://trueprofit.io/pricing).
- [D] **Campaign Name Filters ("Ad Sync Custom Rules")**:
  - Include/exclude keywords (comma separated), one filter per ad account.
  - Applies to current and future campaigns, filtered immediately.
  - The plan gate is Ultimate and above; on downgrade, filters are disabled and all campaigns sync.
  (HC/13349042)
  - [AMBIG] The pricing card lists "Ad Sync Custom Rules" under Advanced; the matrix says Ultimate+.
- [D] **Currency**: ad spend in another currency is converted to store currency at **daily** rates from **openexchangerates.org** (HC/11325376).
- [D] Ad spend cannot be edited manually (HC/11325389).
- [D] UTM ad revenue: since v9.18, "{ad channel} ad revenue" metrics use revenue pulled from the ad platforms (HC/11330293). The pricing page lists "Monitor Revenue & ROAS based on UTM" on all plans, and v9.52 mentions a "Revenue by UTM" view (https://trueprofit.io/pricing, HC/11330293).
  - [AMBIG] It is unclear whether "Revenue by UTM" is TrueProfit-computed or platform-reported after v9.18.

### 7.2 TrueProfit Pixel + attribution — HC/11330283, HC/11330252, HC/11330282, HC/11330291, HC/11330289, HC/12568948
- [D] Pixel = a Shopify custom (web) pixel. It collects product views, add to cart, checkout and post-purchase events.
  - Installs after 30 May 2024 are authorized at install; older installs click "Go to authorize".
  - Plus the **TrueProfit Tracking app embed**, toggled in the theme editor under App embeds.
- [D] **URL parameters** (required for MA and product ad spend):
  - `tp_source` (platform), `tp_adid` (macro), optional `tp_campaignid` (Google), `tp_productid` (Shopify product ID; omit if not product-specific).
  - FB: `tp_source=facebook&tp_adid={{ad.id}}`
  - Google: `{lpurl}?tp_source=google&tp_adid={creative}&tp_campaignid={campaignid}`
  - Bing: `tp_source=bing&tp_adid={AdId}`
  - Snapchat: `tp_adid={{ad.id}}`
  - TikTok: `tp_adid=__CID__`
  - Pinterest: `tp_adid={adid}`
  - X has no macros.
  - FB, Google and Microsoft take these in the "URL Parameters" field; TikTok, Pinterest, Snapchat and X need a full https:// URL.
  (HC/11330291)
- [D] Tools:
  - Chrome "TrueProfit Parameter Generator" extension: sign in with TrueProfit or Shopify; auto-detects platform; picks store and product (best-seller by units preselected); "Auto-fill Parameter". (HC/11330289)
  - In-app **URL Builder** (beta): destination URL, platform, optional extra UTM with dynamic macros per platform; auto-fills Ad ID and detects Product ID from the URL. (HC/12568948)
- [D] **Attribution model**: Last-clicked Purchase (full credit, one per order) plus Assisted Purchases (earlier ad clicks). 30-day window (beta). Profit per ad source. Enterprise plan only. (HC/11330282, HC/16244021)
- [D] **Per-order ad spend allocation** by tracked clicks (§2.2, HC/16554887).
- [NOT FOUND] Configurable attribution windows or models (first-click, linear, etc.); view-through attribution; CAPI / server-side event forwarding.

---

## 8. Onboarding flow

- [D] Install from Shopify (Shopify app billing). Every plan has a **14-day free trial**; billing starts the day after it ends (HC/15855069).
- [D] **Current onboarding (v9.32, May 2026)**: Welcome → Choose a plan → Review store settings (currency, display language, date range, payment status filter) → "how you heard about TrueProfit" → Dashboard. After onboarding a **data sync banner** shows how much Shopify data has synced and the estimated time. The older "Journey to Net Profit" flow was removed (HC/11330293).
- [D] Earlier onboarding versions: v7.5 / v7.7 / "Onboarding V2", plus quick set-up guide modals on every cost page (HC/11330293).
- [D] Recommended set-up order after install (HC/11324699):
  1. COGS
  2. Shipping costs or shipping providers
  3. Connect marketing channels
  4. Transaction fees
  5. Custom Costs, Taxes Paid, Handling Fees
- [D] New stores also grant the read-only Shopify Payments permission during setup (v9.33) and the Pixel at install (HC/11330283).
- [D] Reinstall = new subscription; onboarding repeats (HC/15855069).
- [D] Account: by default the user logs in with the Shopify store. Creating a TrueProfit account (email/password, or Google/Apple) unlocks multi-store, mobile app and team. After linking, Shopify-domain login no longer works (HC/11325510, HC/11330367).
- [D/AMBIG] **Initial sync / history length**:
  - Pricing says "**Unlimited Historical Data** — Sync and view historical data of your shop without any limit on time period" on all plans (https://trueprofit.io/pricing).
  - Integration rules say "Generally, TrueProfit will sync data from the last 3 years since the installation date" (HC/13127685); ad spend goes back to the later of store creation or 3 years.
  - POD integrations sync "since the established date" (v8.6).
  - No per-plan history limits are documented. Initial sync duration is not quantified ("data sync banner … how long it may take").
- [D] Product Analytics funnel data starts only after the pixel is enabled (allow 7 days) (HC/11330258). Per-order ad spend exists only for orders after install (HC/16554887).
- [D] TikTok Shop onboarding: create account → connect shop → choose US or non-US market → authorize → sync (HC/11330575).

---

## 9. Multi-store, currency, timezone, mobile, exports, notifications, team, pricing

### 9.1 Multi-store — HC/11329822, HC/11330354, HC/11330347, HC/16117542
- [D] One TrueProfit account can hold many stores, plus stores shared with the user. Each store needs **its own plan**. The **All stores** aggregate view is free and covers Dashboard and P&L.
- [D] Pricing FAQ: a special discount is offered for more than 5 stores; there is no yearly plan.
- [D] A store can belong to only one account; remove it before adding it elsewhere.
- [D] All-stores currency: each store is converted into one base currency ("using your store's currency as the base") at daily rates, then summed. Display currency can differ.
- [D] Custom metrics are not available in All Stores view (HC/12856190).
- [D] TikTok Shops and Shopify stores can share one account (HC/11330575, HC/11330639). Legacy Amazon seller dashboards (2023) were discontinued (v6.0) (HC/11330293).

### 9.2 Currency — HC/11330404, HC/11325376, HC/16117542, HC/16293283
- [D] **Display currency** (Account info, top right) is display-only. Data and cost settings are kept in the Shopify store currency, then converted.
- [D] Exchange rates: daily, openexchangerates.org.
- [D] Orders with more than one currency are converted to store currency (v5.6). Shipping providers and ad accounts in other currencies are converted to store currency.
- [D] Chargeback FX uses the rate on the dispute resolution date (HC/16293283).
- [D] Language: English, French, Spanish; requires a TrueProfit account (HC/11330404).
- [AMBIG] Whether historical orders use the rate of the order date for display conversion is not documented.

### 9.3 Timezone
- [D] The calendar's "today" follows the **store timezone** (v9.39). A fix for "Today" transaction fees for stores outside UTC (v9.46) (HC/11330293).
- [D] Users are told to match date range and timezone when reconciling with Shopify (HC/15457132).
- [NOT FOUND] A user-configurable timezone setting.

### 9.4 Mobile app — HC/11330581, HC/11330606, HC/11330619
- [D] Free on iOS (https://apps.apple.com/us/app/trueprofit/id1568063007) and Android (https://play.google.com/store/apps/details?id=io.trueprofit). Needs a TrueProfit account. Sign in with credentials, social login, or by scanning the QR code shown under "Get mobile app" on the web.
- [D] Mobile dashboard:
  - Editable **pinned metrics**.
  - Swipeable **metric groups** (Ad Spend Summary, Order Summary, Customer Summary, Others).
  - Performance chart, Cost Breakdown, Ad Spend by Channel, Orders vs Ad Spend per Order.
  - Double-tap a bar to see its value.
- [D] Home-screen **widgets**: iOS 17+ and Android 8.0+. One size. Pick store and metrics; editable on iOS, but must be re-added on Android to change.
- [D] Opening the mobile app triggers third-party sync (v9.18). Custom metrics are not on mobile (HC/12856190).

### 9.5 Notifications / email reports — HC/11330272, HC/11330293
- [D] **Email Reports** (Store Settings): recipient list with email confirmation; the sending frequency also sets the data period. Pricing says daily, weekly or monthly.
- [D] **Custom Email Reports** (Advanced+): unlimited reports and recipients. Name → recipients → frequency → choose metrics → edit email title and content → drag to reorder metrics → Finish.
- [D] In-app **Notifications** (critical issues needing action: failed connections, expired API keys, with Retry / Update API Key / Reconnect buttons) are separate from **Data Sync Status** (progress of syncs, recalculations, imports and exports) (v9.19).
- [D] Older note: notifications keep completed progress for 72 hours (v6.2).
- [NOT FOUND] Push notifications, Slack alerts, or threshold-based alerts.

### 9.6 Team / roles — HC/11330222, HC/11330293, HC/11330268, HC/14086381
- [D] Roles: **Admin**, **Editor**, **Viewer**. Invites by email with store-level access selection.
  - Viewer (read-only): Dashboard, Product Analytics, MA, P&L, CLV.
  - Editor (edit and fix): COGS, Shipping Costs, Orders Report, Transaction Fees, Taxes Paid, Custom Costs, Integrations.
  - Admin: everything.
  - Calculation Preferences: Owner/Admin only. P&L: Viewer/Admin only. MCP: Admin/Viewer only.
  - A role change signs the user out instantly (v9.41).
- [D] Team member limits by plan: 3 / 5 / 10 / Unlimited (https://trueprofit.io/pricing).

### 9.7 Pricing plans — https://trueprofit.io/pricing, HC/15855069, HC/11330217, HC/11330293
- [D] Plan list:

  | Plan | Price | Orders per cycle | Extra order fee | Max surcharge |
  |---|---|---|---|---|
  | Basic | $35/mo | 300 | $0.30 | $300 |
  | Advanced | $60/mo | 600 | $0.20 | $500 |
  | Ultimate (Recommended) | $100/mo | 1,500 | $0.10 | $700 |
  | Enterprise | $200/mo | 3,500 | $0.07 | $1,000 |

- [D] Comparison matrix (Basic / Advanced / Ultimate / Enterprise):
  - On all plans: realtime P/L, All-store view, data export, unlimited historical data, custom metrics, CLV, Orders Report, quantity-based COGS, UTM revenue/ROAS, weight-based shipping, fixed and variable custom costs, categories, Taxes Paid, marketing channels, dropshipping platforms, external shipping platforms, email reports, mobile app.
  - Product Analytics: No / Yes / Yes / Yes.
  - P&L Report: No / Yes / Yes / Yes.
  - Shopify Shipping Auto-Sync: No / Yes / Yes / Yes.
  - Customizable email reports: No / Yes / Yes / Yes.
  - Ad Sync Custom Rules: No / No / Yes / Yes.
  - Marketing Attribution: Enterprise only. TrueProfit MCP: Enterprise only.
  - COGS zones: 5 / 10 / unlimited / unlimited.
  - Ad accounts per channel: 1 / 2 / 5 / 10.
  - Team members: 3 / 5 / 10 / unlimited.
- [AMBIG] The plan cards contradict the matrix: "Product Analytics" is listed in Basic's card, and "Ad Sync Custom Rules" appears in both Advanced's and Ultimate's cards. Treat the matrix and the help articles (PA = Advanced+, filters = Ultimate+) as authoritative.
- [D] Billing:
  - Through Shopify app billing, on a 30-day cycle.
  - Upgrades and downgrades are prorated ("pay for the days left").
  - Promo or referral code field on the in-app pricing page (HC/11330221).
  - Cancel at end of cycle or immediately; any extra-order fee is charged at cancellation.
  - Uninstalling stops future cycles; already-generated charges remain.
  - No yearly plan (pricing FAQ). [AMBIG] v5.7 said Enterprise was annual with unlimited orders (an old plan).
- [D] Plan history: legacy Premium $19.95 and Freemium were retired in Jan 2026 (v9.23). "Updated new pricing for new users only" in Jun 2025 (v8.9). Referral programme sunset in v9.30 (HC/11330293).

---

## 10. Data refresh behaviour and known limitations

### 10.1 Sync frequency — HC/15919801, HC/13127685, HC/11330293
- [D] Shopify orders and revenue: "Near real-time (a few minutes)". Pricing markets "Realtime Profit/Loss Tracking".
- [D] Ad spend: every 5–10 minutes (Taboola 15). COGS: when costs are updated; past orders recalculate on demand. Shipping: per settings.
- [D] **Third-party syncs run only "when you're logged in to TrueProfit"** (web, plus mobile app open since v9.18). Intervals: CJ 2 h, AutoDS 1 h, Eprolo 15 min, Zopi 2 h, Printify 15 min, Printful, Gelato and Gooten 1 h, Teelaunch 5 min, Stripe and PayPal 3 h, shipping providers 5 min.
- [D] There is a manual "Refresh" button for a broken Shopify connection. Reconnect under Settings → Integrations. "A manual recalculation can also refresh the data." (HC/15919801, HC/15457132)
- [D] Some figures are computed live. For example, the Shop Cash fee fix applied to past dates automatically (v9.51).
- [D] Data Sync Status shows progress. The dashboard has a sync status indicator and a "Last updated" time (v9.9, v9.43).

### 10.2 Known limitations / gotchas (documented)
- [D] Integration-synced COGS, shipping and transaction fees **lock** per order; locked values can't be edited, even after disconnecting (HC/12381267, HC/11325244, HC/11325346).
- [D] New COGS page has no historical COGS, CSV import/export or bulk actions (HC/13234734).
- [D] Handling-fee mode choice is irreversible (HC/16065248).
- [D] Shipping v2: switching method wipes costs (HC/16412210).
- [D] Chargebacks (beta): only Shopify Payments; no order-level detail; no auto-correction of reversed decisions; disputed tax isn't reversed (HC/16293283).
- [D] Marketing Attribution: Enterprise only; needs Pixel plus URL params per ad; 30-day window in beta (HC/11330282).
- [D] Product Analytics needs the Pixel; data only after enabling (HC/11330258).
- [D] Per-order ad spend only for post-install orders; Orders Report ad spend total ≠ store total (HC/16554887).
- [D] Ad spend can't be manually edited (HC/11325389).
- [D] Custom metrics: no nesting; not available in All Stores or on mobile (HC/12856190).
- [D] Orders Report includes refunded and cancelled orders while Dashboard and P&L exclude them, so totals differ by design (HC/15164172).
- [D] Product Analytics COGS and Units include cancelled orders, and its revenue doesn't deduct returns; the Dashboard does (HC/15162558).
- [D] Refund/substitution "Order date" settings break the match with Shopify Revenue/Returns (HC/11325268).
- [D] Recalculation failures aren't auto-retried (HC/16051710).
- [D] Deleted products may linger in COGS and need support (HC/11325285).
- [D] Variant cap: 250 per product (v9.42).
- [D] Sunset features (don't copy blindly): Profit Optimizer, Bundling Insights (v9.24); Compass / AI Compass chat (v9.15); Custom Revenue (v9.21); Lite Mode (v8.9); Referral & Earn (v9.30); Amazon seller dashboards (v6.0) (HC/11330293).

---
## Appendix A — Help-center article index (by collection)

Root: https://helpdesk.trueprofit.io/en/ — top-level collections: Quick start guides, Cost Settings, Integration, Account & Billings, TrueProfit for TikTok Shop, Report, Marketing Attribution, Changelog, TrueProfit Mobile App, Metric Glossary, TrueProfit MCP Server.

### Quick-start Guides — https://helpdesk.trueprofit.io/en/collections/12819127-quick-start-guides
- Set up costs for new stores — https://helpdesk.trueprofit.io/en/articles/11324699-set-up-costs-for-new-stores
- Switch between multiple stores — https://helpdesk.trueprofit.io/en/articles/11330347-switch-between-multiple-stores
- Add/Link a store to your TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11330354-add-link-a-store-to-your-trueprofit-account
- Maximize your TrueProfit experience with a TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11330367-maximize-your-trueprofit-experience-with-a-trueprofit-account
- Change currency and language in the app — https://helpdesk.trueprofit.io/en/articles/11330404-change-currency-and-language-in-the-app
- Set a default date range for all reports — https://helpdesk.trueprofit.io/en/articles/11330415-set-a-default-date-range-for-all-reports
- Why good website speed is vital for E-commerce success — https://helpdesk.trueprofit.io/en/articles/11330425-why-good-website-speed-is-vital-for-e-commerce-success

### Cost Settings — https://helpdesk.trueprofit.io/en/collections/12820258-cost-settings
- Version 1: Set up Cost of Goods (COGS) — https://helpdesk.trueprofit.io/en/articles/11325035-version-1-set-up-cost-of-goods-cogs
- Version 1- How TrueProfit import your COGS upon installing — https://helpdesk.trueprofit.io/en/articles/11325096-version-1-how-trueprofit-import-your-cogs-upon-installing
- Version 1: Add & manage historical COGS (COGS in the past) — https://helpdesk.trueprofit.io/en/articles/11325110-version-1-add-manage-historical-cogs-cogs-in-the-past
- Version 1: Add zones to manage COGS in Cost of Goods — https://helpdesk.trueprofit.io/en/articles/11325050-version-1-add-zones-to-manage-cogs-in-cost-of-goods
- Version 1: Set up Quantity-based COGS or Bundled COGS — https://helpdesk.trueprofit.io/en/articles/11325027-version-1-set-up-quantity-based-cogs-or-bundled-cogs
- Version 2: Set up cost of goods sold and bundle costs (newest) — https://helpdesk.trueprofit.io/en/articles/12381267-version-2-set-up-cost-of-goods-sold-and-bundle-costs-newest
- Action needed: COGS page upgrade & migration notice — https://helpdesk.trueprofit.io/en/articles/13234734-action-needed-cogs-page-upgrade-migration-notice
- How to recalculate COGS for past orders — https://helpdesk.trueprofit.io/en/articles/16051710-how-to-recalculate-cogs-for-past-orders
- Version 1: Set up Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325206-version-1-set-up-shipping-costs
- Version 1: Set up quantity-based and weight-based Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325209-version-1-set-up-quantity-based-and-weight-based-shipping-costs
- Version 1: Create Product groups to add Shipping Cost for specific products — https://helpdesk.trueprofit.io/en/articles/11325214-version-1-create-product-groups-to-add-shipping-cost-for-specific-products
- Version 1: Calculation settings for Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325219-version-1-calculation-settings-for-shipping-costs
- Version 2 (beta): Set up Shipping Costs in the main view — https://helpdesk.trueprofit.io/en/articles/13856923-version-2-beta-set-up-shipping-costs-in-the-main-view
- Version 2 (beta): How to set up Shipping Cost Settings — https://helpdesk.trueprofit.io/en/articles/16412210-version-2-beta-how-to-set-up-shipping-cost-settings
- Version 2 (beta): Create a shipping cost product group — https://helpdesk.trueprofit.io/en/articles/16412281-version-2-beta-create-a-shipping-cost-product-group
- Version 2 (beta): Add shipping zone — https://helpdesk.trueprofit.io/en/articles/16412341-version-2-beta-add-shipping-zone
- Set up Taxes Paid — https://helpdesk.trueprofit.io/en/articles/11325259-set-up-taxes-paid
- Extract Bill with AI: Automate Your Custom Costs — https://helpdesk.trueprofit.io/en/articles/13904711-extract-bill-with-ai-automate-your-custom-costs
- Set up custom costs — https://helpdesk.trueprofit.io/en/articles/12289182-set-up-custom-costs
- How app estimates payment provider fees — https://helpdesk.trueprofit.io/en/articles/12707607-how-app-estimates-payment-provider-fees
- Payment gateways: rate and fees — https://helpdesk.trueprofit.io/en/articles/12678889-payment-gateways-rate-and-fees
- Set up Transaction Fees — https://helpdesk.trueprofit.io/en/articles/11325244-set-up-transaction-fees
- How to use Calculation Preferences — https://helpdesk.trueprofit.io/en/articles/11325268-how-to-use-calculation-preferences
- Bulk editing order costs in Orders Report — https://helpdesk.trueprofit.io/en/articles/11325271-bulk-editing-order-costs-in-orders-report
- FAQ: Can I import shipping settings from Shopify? — https://helpdesk.trueprofit.io/en/articles/11325275-faq-can-i-import-shipping-settings-from-shopify
- FAQ: How to set shipping cost as 0 (free shipping)? — https://helpdesk.trueprofit.io/en/articles/11325277-faq-how-to-set-shipping-cost-as-0-free-shipping
- FAQ: Are your order costs not updating? — https://helpdesk.trueprofit.io/en/articles/11325281-faq-are-your-order-costs-not-updating
- FAQ: How can I remove deleted products that still show in COGS? — https://helpdesk.trueprofit.io/en/articles/11325285-faq-how-can-i-remove-deleted-products-that-still-show-in-cogs
- FAQ: How do I change sale prices in TrueProfit? — https://helpdesk.trueprofit.io/en/articles/11325288-faq-how-do-i-change-sale-prices-in-trueprofit
- How to set up custom costs for specific orders using order tag — https://helpdesk.trueprofit.io/en/articles/11325290-how-to-set-up-custom-costs-for-specific-orders-using-order-tag
- FAQ: What are the differences between Taxes Collected and Taxes Paid? — https://helpdesk.trueprofit.io/en/articles/11325292-faq-what-are-the-differences-between-taxes-collected-and-taxes-paid
- Does TrueProfit let me set different supplier costs based on order quantity? — https://helpdesk.trueprofit.io/en/articles/16388713-does-trueprofit-let-me-set-different-supplier-costs-based-on-order-quantity
- How to set up Handling Fees — https://helpdesk.trueprofit.io/en/articles/16065248-how-to-set-up-handling-fees

### Product Cost (COGS) — https://helpdesk.trueprofit.io/en/collections/12820636-product-cost-cogs
- Version 1: Set up Cost of Goods (COGS) — https://helpdesk.trueprofit.io/en/articles/11325035-version-1-set-up-cost-of-goods-cogs
- Version 1- How TrueProfit import your COGS upon installing — https://helpdesk.trueprofit.io/en/articles/11325096-version-1-how-trueprofit-import-your-cogs-upon-installing
- Version 1: Add & manage historical COGS (COGS in the past) — https://helpdesk.trueprofit.io/en/articles/11325110-version-1-add-manage-historical-cogs-cogs-in-the-past
- Version 1: Add zones to manage COGS in Cost of Goods — https://helpdesk.trueprofit.io/en/articles/11325050-version-1-add-zones-to-manage-cogs-in-cost-of-goods
- Version 1: Set up Quantity-based COGS or Bundled COGS — https://helpdesk.trueprofit.io/en/articles/11325027-version-1-set-up-quantity-based-cogs-or-bundled-cogs
- Version 2: Set up cost of goods sold and bundle costs (newest) — https://helpdesk.trueprofit.io/en/articles/12381267-version-2-set-up-cost-of-goods-sold-and-bundle-costs-newest
- Action needed: COGS page upgrade & migration notice — https://helpdesk.trueprofit.io/en/articles/13234734-action-needed-cogs-page-upgrade-migration-notice
- How to recalculate COGS for past orders — https://helpdesk.trueprofit.io/en/articles/16051710-how-to-recalculate-cogs-for-past-orders
- Does TrueProfit let me set different product costs (COGS) by country or zone? — https://helpdesk.trueprofit.io/en/articles/16413032-does-trueprofit-let-me-set-different-product-costs-cogs-by-country-or-zone

### Shipping Cost — https://helpdesk.trueprofit.io/en/collections/12820647-shipping-cost
- Version 1: Set up Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325206-version-1-set-up-shipping-costs
- Version 1: Set up quantity-based and weight-based Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325209-version-1-set-up-quantity-based-and-weight-based-shipping-costs
- Version 1: Create Product groups to add Shipping Cost for specific products — https://helpdesk.trueprofit.io/en/articles/11325214-version-1-create-product-groups-to-add-shipping-cost-for-specific-products
- Version 1: Calculation settings for Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325219-version-1-calculation-settings-for-shipping-costs
- Version 2 (beta): Set up Shipping Costs in the main view — https://helpdesk.trueprofit.io/en/articles/13856923-version-2-beta-set-up-shipping-costs-in-the-main-view
- Version 2 (beta): How to set up Shipping Cost Settings — https://helpdesk.trueprofit.io/en/articles/16412210-version-2-beta-how-to-set-up-shipping-cost-settings
- Version 2 (beta): Create a shipping cost product group — https://helpdesk.trueprofit.io/en/articles/16412281-version-2-beta-create-a-shipping-cost-product-group
- Version 2 (beta): Add shipping zone — https://helpdesk.trueprofit.io/en/articles/16412341-version-2-beta-add-shipping-zone
- Does TrueProfit let me set different shipping costs by zone or country? — https://helpdesk.trueprofit.io/en/articles/16307234-does-trueprofit-let-me-set-different-shipping-costs-by-zone-or-country
- Does TrueProfit let me set different shipping costs for specific products? — https://helpdesk.trueprofit.io/en/articles/16307310-does-trueprofit-let-me-set-different-shipping-costs-for-specific-products
- Does TrueProfit let me calculate shipping cost by weight or quantity for accurate margin? — https://helpdesk.trueprofit.io/en/articles/16412986-does-trueprofit-let-me-calculate-shipping-cost-by-weight-or-quantity-for-accurate-margin

### Other Cost — https://helpdesk.trueprofit.io/en/collections/12820904-other-cost
- How to use Calculation Preferences — https://helpdesk.trueprofit.io/en/articles/11325268-how-to-use-calculation-preferences
- Bulk editing order costs in Orders Report — https://helpdesk.trueprofit.io/en/articles/11325271-bulk-editing-order-costs-in-orders-report

### FAQs — https://helpdesk.trueprofit.io/en/collections/12820943-faqs
- FAQ: Can I import shipping settings from Shopify? — https://helpdesk.trueprofit.io/en/articles/11325275-faq-can-i-import-shipping-settings-from-shopify
- FAQ: How to set shipping cost as 0 (free shipping)? — https://helpdesk.trueprofit.io/en/articles/11325277-faq-how-to-set-shipping-cost-as-0-free-shipping
- FAQ: Are your order costs not updating? — https://helpdesk.trueprofit.io/en/articles/11325281-faq-are-your-order-costs-not-updating
- FAQ: How can I remove deleted products that still show in COGS? — https://helpdesk.trueprofit.io/en/articles/11325285-faq-how-can-i-remove-deleted-products-that-still-show-in-cogs
- FAQ: How do I change sale prices in TrueProfit? — https://helpdesk.trueprofit.io/en/articles/11325288-faq-how-do-i-change-sale-prices-in-trueprofit
- How to set up custom costs for specific orders using order tag — https://helpdesk.trueprofit.io/en/articles/11325290-how-to-set-up-custom-costs-for-specific-orders-using-order-tag
- FAQ: What are the differences between Taxes Collected and Taxes Paid? — https://helpdesk.trueprofit.io/en/articles/11325292-faq-what-are-the-differences-between-taxes-collected-and-taxes-paid
- Does TrueProfit let me set different supplier costs based on order quantity? — https://helpdesk.trueprofit.io/en/articles/16388713-does-trueprofit-let-me-set-different-supplier-costs-based-on-order-quantity

### Integration — https://helpdesk.trueprofit.io/en/collections/12820984-integration
- Integration sync rules: Data, frequency, and connection method — https://helpdesk.trueprofit.io/en/articles/13127685-integration-sync-rules-data-frequency-and-connection-method
- Connect Facebook Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325313-connect-facebook-ads-with-trueprofit
- Connect Google Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/14631734-connect-google-ads-with-trueprofit
- Connect TikTok Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325316-connect-tiktok-ads-with-trueprofit
- Connect Pinterest Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325323-connect-pinterest-ads-with-trueprofit
- Connect Microsoft Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325318-connect-microsoft-ads-with-trueprofit
- Connect Snapchat Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325329-connect-snapchat-ads-with-trueprofit
- Connect Amazon Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325334-connect-amazon-ads-with-trueprofit
- Connect X Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325337-connect-x-ads-with-trueprofit
- Connect Taboola Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325340-connect-taboola-ads-with-trueprofit
- Connect AdRoll Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11847898-connect-adroll-ads-with-trueprofit
- Connect AppLovin with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11848154-connect-applovin-with-trueprofit
- Connect Yotpo with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11966823-connect-yotpo-with-trueprofit
- Manage Marketing Channel Accounts and Set Up Ad Spend Sync by Campaign Filter — https://helpdesk.trueprofit.io/en/articles/13349042-manage-marketing-channel-accounts-and-set-up-ad-spend-sync-by-campaign-filter
- Connect with CJ Dropshipping — https://helpdesk.trueprofit.io/en/articles/11325346-connect-with-cj-dropshipping
- Integrate Dropshipping Platforms with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325353-integrate-dropshipping-platforms-with-trueprofit
- Connect with Eprolo dropshipping platform — https://helpdesk.trueprofit.io/en/articles/11640102-connect-with-eprolo-dropshipping-platform
- Connect with Zopi dropshipping platform — https://helpdesk.trueprofit.io/en/articles/11640292-connect-with-zopi-dropshipping-platform
- Connect autoDS with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11982788-connect-autods-with-trueprofit
- Connect Shipping Providers and sync Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325365-connect-shipping-providers-and-sync-shipping-costs
- Integrate Print-On-Demand platforms with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11331248-integrate-print-on-demand-platforms-with-trueprofit
- Connect with Printify print-on-demand — https://helpdesk.trueprofit.io/en/articles/11363299-connect-with-printify-print-on-demand
- Connect with Printful print-on-demand — https://helpdesk.trueprofit.io/en/articles/11363314-connect-with-printful-print-on-demand
- Connect with Gelato print-on-demand — https://helpdesk.trueprofit.io/en/articles/11389433-connect-with-gelato-print-on-demand
- Connect with Gooten Print-on-Demand — https://helpdesk.trueprofit.io/en/articles/11639815-connect-with-gooten-print-on-demand
- Connect with Teelaunch Print-on-Demand — https://helpdesk.trueprofit.io/en/articles/11640070-connect-with-teelaunch-print-on-demand
- Connect Stripe payment provider — https://helpdesk.trueprofit.io/en/articles/12917436-connect-stripe-payment-provider
- How PayPal works in TrueProfit — https://helpdesk.trueprofit.io/en/articles/13071872-how-paypal-works-in-trueprofit
- What if my store currency differs from my ad account currency? — https://helpdesk.trueprofit.io/en/articles/11325376-what-if-my-store-currency-differs-from-my-ad-account-currency
- Troubleshooting Google Ads connection — https://helpdesk.trueprofit.io/en/articles/11325378-troubleshooting-google-ads-connection
- Can I update ad spend manually? — https://helpdesk.trueprofit.io/en/articles/11325389-can-i-update-ad-spend-manually

### Integrate Marketing Channels — https://helpdesk.trueprofit.io/en/collections/12820986-integrate-marketing-channels
- Connect Facebook Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325313-connect-facebook-ads-with-trueprofit
- Connect Google Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/14631734-connect-google-ads-with-trueprofit
- Connect TikTok Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325316-connect-tiktok-ads-with-trueprofit
- Connect Pinterest Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325323-connect-pinterest-ads-with-trueprofit
- Connect Microsoft Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325318-connect-microsoft-ads-with-trueprofit
- Connect Snapchat Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325329-connect-snapchat-ads-with-trueprofit
- Connect Amazon Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325334-connect-amazon-ads-with-trueprofit
- Connect X Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325337-connect-x-ads-with-trueprofit
- Connect Taboola Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325340-connect-taboola-ads-with-trueprofit
- Connect AdRoll Ads with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11847898-connect-adroll-ads-with-trueprofit
- Connect AppLovin with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11848154-connect-applovin-with-trueprofit
- Connect Yotpo with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11966823-connect-yotpo-with-trueprofit
- Manage Marketing Channel Accounts and Set Up Ad Spend Sync by Campaign Filter — https://helpdesk.trueprofit.io/en/articles/13349042-manage-marketing-channel-accounts-and-set-up-ad-spend-sync-by-campaign-filter

### Integrate Dropshipping Platforms — https://helpdesk.trueprofit.io/en/collections/12821104-integrate-dropshipping-platforms
- Connect with CJ Dropshipping — https://helpdesk.trueprofit.io/en/articles/11325346-connect-with-cj-dropshipping
- Integrate Dropshipping Platforms with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11325353-integrate-dropshipping-platforms-with-trueprofit
- Connect with Eprolo dropshipping platform — https://helpdesk.trueprofit.io/en/articles/11640102-connect-with-eprolo-dropshipping-platform
- Connect with Zopi dropshipping platform — https://helpdesk.trueprofit.io/en/articles/11640292-connect-with-zopi-dropshipping-platform
- Connect autoDS with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11982788-connect-autods-with-trueprofit

### Integrate Shipping Providers — https://helpdesk.trueprofit.io/en/collections/12821136-integrate-shipping-providers
- Connect Shipping Providers and sync Shipping Costs — https://helpdesk.trueprofit.io/en/articles/11325365-connect-shipping-providers-and-sync-shipping-costs

### FAQs — https://helpdesk.trueprofit.io/en/collections/12821165-faqs
- What if my store currency differs from my ad account currency? — https://helpdesk.trueprofit.io/en/articles/11325376-what-if-my-store-currency-differs-from-my-ad-account-currency
- Troubleshooting Google Ads connection — https://helpdesk.trueprofit.io/en/articles/11325378-troubleshooting-google-ads-connection
- Can I update ad spend manually? — https://helpdesk.trueprofit.io/en/articles/11325389-can-i-update-ad-spend-manually

### Account & Billings — https://helpdesk.trueprofit.io/en/collections/12821425-account-billings
- Create a TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11325510-create-a-trueprofit-account
- Add a store to your TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11329822-add-a-store-to-your-trueprofit-account
- Manage your social sign-ins — https://helpdesk.trueprofit.io/en/articles/11329853-manage-your-social-sign-ins
- How to cancel your subscription — https://helpdesk.trueprofit.io/en/articles/11330217-how-to-cancel-your-subscription
- How to apply a promo code in TrueProfit Pricing — https://helpdesk.trueprofit.io/en/articles/11330221-how-to-apply-a-promo-code-in-trueprofit-pricing
- FAQ: TrueProfit billing & subscription: how it works — https://helpdesk.trueprofit.io/en/articles/15855069-faq-trueprofit-billing-subscription-how-it-works
- Add team members to your stores — https://helpdesk.trueprofit.io/en/articles/11330222-add-team-members-to-your-stores

### TrueProfit for TikTok Shop — https://helpdesk.trueprofit.io/en/collections/12821432-trueprofit-for-tiktok-shop
- Metric Glossary for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330573-metric-glossary-for-tiktok-shops
- Onboarding your TikTok Shop on TrueProfit — https://helpdesk.trueprofit.io/en/articles/11330575-onboarding-your-tiktok-shop-on-trueprofit
- Product Analytics for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330580-product-analytics-for-tiktok-shops
- Setting up Email Reports for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330585-setting-up-email-reports-for-tiktok-shops
- How to set up Cost of Goods for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330590-how-to-set-up-cost-of-goods-for-tiktok-shops
- Setting up Affiliate Commission rate — https://helpdesk.trueprofit.io/en/articles/11330600-setting-up-affiliate-commission-rate
- Set up Custom Cost for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330610-set-up-custom-cost-for-tiktok-shops
- How to connect and sync Ad Spend from TikTok — https://helpdesk.trueprofit.io/en/articles/11330638-how-to-connect-and-sync-ad-spend-from-tiktok
- Can I add multiple shops to my account? — https://helpdesk.trueprofit.io/en/articles/11330639-can-i-add-multiple-shops-to-my-account

### TrueProfit Account — https://helpdesk.trueprofit.io/en/collections/12831026-trueprofit-account
- Create a TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11325510-create-a-trueprofit-account
- Add a store to your TrueProfit account — https://helpdesk.trueprofit.io/en/articles/11329822-add-a-store-to-your-trueprofit-account
- Manage your social sign-ins — https://helpdesk.trueprofit.io/en/articles/11329853-manage-your-social-sign-ins

### Billing & Pricing — https://helpdesk.trueprofit.io/en/collections/12831623-billing-pricing
- How to cancel your subscription — https://helpdesk.trueprofit.io/en/articles/11330217-how-to-cancel-your-subscription
- How to apply a promo code in TrueProfit Pricing — https://helpdesk.trueprofit.io/en/articles/11330221-how-to-apply-a-promo-code-in-trueprofit-pricing
- FAQ: TrueProfit billing & subscription: how it works — https://helpdesk.trueprofit.io/en/articles/15855069-faq-trueprofit-billing-subscription-how-it-works

### Manage Store — https://helpdesk.trueprofit.io/en/collections/12831660-manage-store
- Add team members to your stores — https://helpdesk.trueprofit.io/en/articles/11330222-add-team-members-to-your-stores

### Report — https://helpdesk.trueprofit.io/en/collections/12831805-report
- How to export data and reports on TrueProfit — https://helpdesk.trueprofit.io/en/articles/11330278-how-to-export-data-and-reports-on-trueprofit
- Install TrueProfit Pixel for Product Analytics — https://helpdesk.trueprofit.io/en/articles/11330252-install-trueprofit-pixel-for-product-analytics
- Product Analytics Overview — https://helpdesk.trueprofit.io/en/articles/11330258-product-analytics-overview
- Customer Lifetime Value Report — https://helpdesk.trueprofit.io/en/articles/11330264-customer-lifetime-value-report
- Profit & Loss (P&L) Report — https://helpdesk.trueprofit.io/en/articles/11330268-profit-loss-p-l-report
- Set up Email Reports — https://helpdesk.trueprofit.io/en/articles/11330272-set-up-email-reports
- Dashboard Introduction — https://helpdesk.trueprofit.io/en/articles/11330378-dashboard-introduction
- Why is my TrueProfit data not updating? — https://helpdesk.trueprofit.io/en/articles/15919801-why-is-my-trueprofit-data-not-updating
- Multi-Currency Shopify Stores: Does a consolidated profit dashboard convert everything to One Currency? — https://helpdesk.trueprofit.io/en/articles/16117542-multi-currency-shopify-stores-does-a-consolidated-profit-dashboard-convert-everything-to-one-currency
- Understand Ad Spend allocation and Net Profit per order — https://helpdesk.trueprofit.io/en/articles/16554887-understand-ad-spend-allocation-and-net-profit-per-order

### Product Analytics — https://helpdesk.trueprofit.io/en/collections/12831818-product-analytics
- Install TrueProfit Pixel for Product Analytics — https://helpdesk.trueprofit.io/en/articles/11330252-install-trueprofit-pixel-for-product-analytics
- Product Analytics Overview — https://helpdesk.trueprofit.io/en/articles/11330258-product-analytics-overview

### Store reports — https://helpdesk.trueprofit.io/en/collections/12831825-store-reports
- Customer Lifetime Value Report — https://helpdesk.trueprofit.io/en/articles/11330264-customer-lifetime-value-report
- Profit & Loss (P&L) Report — https://helpdesk.trueprofit.io/en/articles/11330268-profit-loss-p-l-report

### Email report settings — https://helpdesk.trueprofit.io/en/collections/12831826-email-report-settings
- Set up Email Reports — https://helpdesk.trueprofit.io/en/articles/11330272-set-up-email-reports

### Marketing Attribution — https://helpdesk.trueprofit.io/en/collections/12831968-marketing-attribution
- Overview: How does marketing attribution work in TrueProfit? — https://helpdesk.trueprofit.io/en/articles/11330282-overview-how-does-marketing-attribution-work-in-trueprofit
- Install TrueProfit Pixel and set up URL parameters — https://helpdesk.trueprofit.io/en/articles/11330283-install-trueprofit-pixel-and-set-up-url-parameters
- Install and use TrueProfit Parameter Generator Extension — https://helpdesk.trueprofit.io/en/articles/11330289-install-and-use-trueprofit-parameter-generator-extension
- Set up URL Parameters manually for your ads — https://helpdesk.trueprofit.io/en/articles/11330291-set-up-url-parameters-manually-for-your-ads
- Beta: Build a URL Parameter in TrueProfit — https://helpdesk.trueprofit.io/en/articles/12568948-beta-build-a-url-parameter-in-trueprofit
- Where is Ad destination URL in Ad channels? — https://helpdesk.trueprofit.io/en/articles/12320111-where-is-ad-destination-url-in-ad-channels
- Add tracking parameters for Facebook ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/11330286-add-tracking-parameters-for-facebook-ads-using-chrome-extension
- Add tracking parameters for Google ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/12941816-add-tracking-parameters-for-google-ads-using-chrome-extension
- Add tracking parameters for TikTok ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/15431931-add-tracking-parameters-for-tiktok-ads-using-chrome-extension
- Does TrueProfit show profit by ad channel, not just ROAS? — https://helpdesk.trueprofit.io/en/articles/16244005-does-trueprofit-show-profit-by-ad-channel-not-just-roas
- Does TrueProfit prevent Facebook and Google from double-counting the same sale? — https://helpdesk.trueprofit.io/en/articles/16244021-does-trueprofit-prevent-facebook-and-google-from-double-counting-the-same-sale

### Setting up for Marketing Attribution — https://helpdesk.trueprofit.io/en/collections/12831970-setting-up-for-marketing-attribution
- Overview: How does marketing attribution work in TrueProfit? — https://helpdesk.trueprofit.io/en/articles/11330282-overview-how-does-marketing-attribution-work-in-trueprofit
- Install TrueProfit Pixel and set up URL parameters — https://helpdesk.trueprofit.io/en/articles/11330283-install-trueprofit-pixel-and-set-up-url-parameters

### Setting up parameters for your ad channels — https://helpdesk.trueprofit.io/en/collections/12832060-setting-up-parameters-for-your-ad-channels
- Install and use TrueProfit Parameter Generator Extension — https://helpdesk.trueprofit.io/en/articles/11330289-install-and-use-trueprofit-parameter-generator-extension
- Set up URL Parameters manually for your ads — https://helpdesk.trueprofit.io/en/articles/11330291-set-up-url-parameters-manually-for-your-ads
- Beta: Build a URL Parameter in TrueProfit — https://helpdesk.trueprofit.io/en/articles/12568948-beta-build-a-url-parameter-in-trueprofit
- Where is Ad destination URL in Ad channels? — https://helpdesk.trueprofit.io/en/articles/12320111-where-is-ad-destination-url-in-ad-channels
- Add tracking parameters for Facebook ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/11330286-add-tracking-parameters-for-facebook-ads-using-chrome-extension
- Add tracking parameters for Google ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/12941816-add-tracking-parameters-for-google-ads-using-chrome-extension
- Add tracking parameters for TikTok ads using Chrome extension — https://helpdesk.trueprofit.io/en/articles/15431931-add-tracking-parameters-for-tiktok-ads-using-chrome-extension

### Changelog — https://helpdesk.trueprofit.io/en/collections/12832101-changelog
- Changelog — https://helpdesk.trueprofit.io/en/articles/11330293-changelog

### Getting started — https://helpdesk.trueprofit.io/en/collections/12833511-getting-started
- Metric Glossary for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330573-metric-glossary-for-tiktok-shops
- Onboarding your TikTok Shop on TrueProfit — https://helpdesk.trueprofit.io/en/articles/11330575-onboarding-your-tiktok-shop-on-trueprofit
- Product Analytics for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330580-product-analytics-for-tiktok-shops
- Setting up Email Reports for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330585-setting-up-email-reports-for-tiktok-shops

### TrueProfit Mobile App — https://helpdesk.trueprofit.io/en/collections/12833605-trueprofit-mobile-app
- Using the TrueProfit Mobile App — https://helpdesk.trueprofit.io/en/articles/11330581-using-the-trueprofit-mobile-app
- Install the TrueProfit mobile app — https://helpdesk.trueprofit.io/en/articles/11330606-install-the-trueprofit-mobile-app
- Set up TrueProfit widget for mobile — https://helpdesk.trueprofit.io/en/articles/11330619-set-up-trueprofit-widget-for-mobile

### Cost settings — https://helpdesk.trueprofit.io/en/collections/12833652-cost-settings
- How to set up Cost of Goods for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330590-how-to-set-up-cost-of-goods-for-tiktok-shops
- Setting up Affiliate Commission rate — https://helpdesk.trueprofit.io/en/articles/11330600-setting-up-affiliate-commission-rate
- Set up Custom Cost for TikTok Shops — https://helpdesk.trueprofit.io/en/articles/11330610-set-up-custom-cost-for-tiktok-shops
- How to connect and sync Ad Spend from TikTok — https://helpdesk.trueprofit.io/en/articles/11330638-how-to-connect-and-sync-ad-spend-from-tiktok

### FAQs — https://helpdesk.trueprofit.io/en/collections/12833936-faqs
- Can I add multiple shops to my account? — https://helpdesk.trueprofit.io/en/articles/11330639-can-i-add-multiple-shops-to-my-account

### Integrate Print-on-demand Platform — https://helpdesk.trueprofit.io/en/collections/12836021-integrate-print-on-demand-platform
- Integrate Print-On-Demand platforms with TrueProfit — https://helpdesk.trueprofit.io/en/articles/11331248-integrate-print-on-demand-platforms-with-trueprofit
- Connect with Printify print-on-demand — https://helpdesk.trueprofit.io/en/articles/11363299-connect-with-printify-print-on-demand
- Connect with Printful print-on-demand — https://helpdesk.trueprofit.io/en/articles/11363314-connect-with-printful-print-on-demand
- Connect with Gelato print-on-demand — https://helpdesk.trueprofit.io/en/articles/11389433-connect-with-gelato-print-on-demand
- Connect with Gooten Print-on-Demand — https://helpdesk.trueprofit.io/en/articles/11639815-connect-with-gooten-print-on-demand
- Connect with Teelaunch Print-on-Demand — https://helpdesk.trueprofit.io/en/articles/11640070-connect-with-teelaunch-print-on-demand

### Integrate Payment Providers — https://helpdesk.trueprofit.io/en/collections/16862779-integrate-payment-providers
- Connect Stripe payment provider — https://helpdesk.trueprofit.io/en/articles/12917436-connect-stripe-payment-provider
- How PayPal works in TrueProfit — https://helpdesk.trueprofit.io/en/articles/13071872-how-paypal-works-in-trueprofit

### Transaction Fees — https://helpdesk.trueprofit.io/en/collections/19026156-transaction-fees
- How app estimates payment provider fees — https://helpdesk.trueprofit.io/en/articles/12707607-how-app-estimates-payment-provider-fees
- Payment gateways: rate and fees — https://helpdesk.trueprofit.io/en/articles/12678889-payment-gateways-rate-and-fees
- Set up Transaction Fees — https://helpdesk.trueprofit.io/en/articles/11325244-set-up-transaction-fees

### Custom Costs — https://helpdesk.trueprofit.io/en/collections/19026183-custom-costs
- Set up Taxes Paid — https://helpdesk.trueprofit.io/en/articles/11325259-set-up-taxes-paid
- Extract Bill with AI: Automate Your Custom Costs — https://helpdesk.trueprofit.io/en/articles/13904711-extract-bill-with-ai-automate-your-custom-costs
- Set up custom costs — https://helpdesk.trueprofit.io/en/articles/12289182-set-up-custom-costs

### Metric Glossary — https://helpdesk.trueprofit.io/en/collections/19637356-metric-glossary
- Dashboard Metric Glossary — https://helpdesk.trueprofit.io/en/articles/11324705-dashboard-metric-glossary
- Product Analytics Metric Glossary — https://helpdesk.trueprofit.io/en/articles/15162558-product-analytics-metric-glossary
- Order Report Metric Glossary — https://helpdesk.trueprofit.io/en/articles/15164172-order-report-metric-glossary
- P&L Report Metric Glossary — https://helpdesk.trueprofit.io/en/articles/15164254-p-l-report-metric-glossary
- Marketing Attribution Metric Glossary — https://helpdesk.trueprofit.io/en/articles/15173321-marketing-attribution-metric-glossary
- Customer Lifetime Value Metric Glossary — https://helpdesk.trueprofit.io/en/articles/15173499-customer-lifetime-value-metric-glossary
- Understanding your TrueProfit numbers vs Shopify — https://helpdesk.trueprofit.io/en/articles/15457132-understanding-your-trueprofit-numbers-vs-shopify
- Set up custom metrics — https://helpdesk.trueprofit.io/en/articles/12856190-set-up-custom-metrics
- How TrueProfit calculates your Net Profit — https://helpdesk.trueprofit.io/en/articles/15561827-how-trueprofit-calculates-your-net-profit
- How Chargeback Loss and Chargeback Fee Work (BETA) — https://helpdesk.trueprofit.io/en/articles/16293283-how-chargeback-loss-and-chargeback-fee-work-beta

### Dashboard report — https://helpdesk.trueprofit.io/en/collections/19687726-dashboard-report
- Dashboard Introduction — https://helpdesk.trueprofit.io/en/articles/11330378-dashboard-introduction
- Why is my TrueProfit data not updating? — https://helpdesk.trueprofit.io/en/articles/15919801-why-is-my-trueprofit-data-not-updating
- Multi-Currency Shopify Stores: Does a consolidated profit dashboard convert everything to One Currency? — https://helpdesk.trueprofit.io/en/articles/16117542-multi-currency-shopify-stores-does-a-consolidated-profit-dashboard-convert-everything-to-one-currency

### Handling Fees — https://helpdesk.trueprofit.io/en/collections/19698113-handling-fees
- How to set up Handling Fees — https://helpdesk.trueprofit.io/en/articles/16065248-how-to-set-up-handling-fees

### FAQs — https://helpdesk.trueprofit.io/en/collections/19711489-faqs
- Does TrueProfit show profit by ad channel, not just ROAS? — https://helpdesk.trueprofit.io/en/articles/16244005-does-trueprofit-show-profit-by-ad-channel-not-just-roas
- Does TrueProfit prevent Facebook and Google from double-counting the same sale? — https://helpdesk.trueprofit.io/en/articles/16244021-does-trueprofit-prevent-facebook-and-google-from-double-counting-the-same-sale

### FAQs — https://helpdesk.trueprofit.io/en/collections/19714681-faqs
- Does TrueProfit let me set different shipping costs by zone or country? — https://helpdesk.trueprofit.io/en/articles/16307234-does-trueprofit-let-me-set-different-shipping-costs-by-zone-or-country
- Does TrueProfit let me set different shipping costs for specific products? — https://helpdesk.trueprofit.io/en/articles/16307310-does-trueprofit-let-me-set-different-shipping-costs-for-specific-products
- Does TrueProfit let me calculate shipping cost by weight or quantity for accurate margin? — https://helpdesk.trueprofit.io/en/articles/16412986-does-trueprofit-let-me-calculate-shipping-cost-by-weight-or-quantity-for-accurate-margin

### TrueProfit MCP Server — https://helpdesk.trueprofit.io/en/collections/19716918-trueprofit-mcp-server
- TrueProfit MCP: Connect TrueProfit to ChatGPT, Claude, and OpenClaw (Clawdbot) — https://helpdesk.trueprofit.io/en/articles/14086381-trueprofit-mcp-connect-trueprofit-to-chatgpt-claude-and-openclaw-clawdbot
- Troubleshooting MCP connection — https://helpdesk.trueprofit.io/en/articles/16390840-troubleshooting-mcp-connection

### FAQs — https://helpdesk.trueprofit.io/en/collections/19717732-faqs
- Does TrueProfit let me set different product costs (COGS) by country or zone? — https://helpdesk.trueprofit.io/en/articles/16413032-does-trueprofit-let-me-set-different-product-costs-cogs-by-country-or-zone

### Order report — https://helpdesk.trueprofit.io/en/collections/19726187-order-report
- Understand Ad Spend allocation and Net Profit per order — https://helpdesk.trueprofit.io/en/articles/16554887-understand-ad-spend-allocation-and-net-profit-per-order


## Appendix B — Key screenshots of the authenticated app UI (curated)

Notes on these URLs:
- They come from help-center article bodies, hosted on Intercom's CDN (`downloads.intercomcdn.com` / `trueprofit-*.intercom-attachments-1.com`).
- Articles serve them as **signed URLs**. The signatures seen at crawl time carry `expires=1792332900` (2026-10-18 14:15 UTC). The signature query string has been removed here, so a bare URL may need a fresh signature: re-open the article to get one.
- This machine's proxy blocks the CDN, so the URLs were not verified, and none were downloaded.
- Each line gives what the image shows (judged from the surrounding text) and the article it comes from.

| Shows | Image URL | Article |
|---|---|---|
| Dashboard three-dots menu (filter by payment status, export, customize metrics) — GIF | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461773/6de2345e2531312733943f7c7261/dashboard_1nztuop.gif | HC/11330378 |
| Dashboard Performance Chart | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461760/c6bbcc02022b6b5ed91d3617f6d8/image_kks4s7.png | HC/11330378 |
| Dashboard Cost Breakdown chart | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461758/4d493985514b582c43caf2b26ac0/image_1luctlh.png | HC/11330378 |
| Ad Spend by Channel + Ad Spend Summary | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461765/a0f2ba3dbacc077100ed07fbc6c1/image_hhii0j.png | HC/11330378 |
| Orders vs Ad Spend per Order + Order Summary | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461772/bae61590dc2281b076b02d6f227b/image_1tlgq0r.png | HC/11330378 |
| Customer Summary / Other metrics | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461768/bc57b5af0d7ac395d1ca7b1ceddd/image_xxdzuj.png | HC/11330378 |
| Chargeback metrics: "Add Metrics" picker | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2612427536/639f2712e53ae504cbbf82d29bb9/add++chargeback.jpg | HC/16293283 |
| Net Profit with chargeback lines | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2612412405/5117aaa72fe5c3454ca1c1192f20/image.png | HC/16293283 |
| Custom metric builder modal (start / fill / example) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2527563368/83e81ef0bfce1731571341622577/1_+start.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1836117146/c389e89d167586ab43801967981e/2_+fill.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1836117378/1070efa45fec1ef15f5f976b36ce/3_+a+co%CC%80ng.png | HC/12856190 |
| Product Analytics prerequisites panel | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1547920228/6801c07cd962a8db31dd6d59b526/image.png | HC/11330258 |
| Product Analytics table | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419432/7479697bf172f6110839c114580b/image_1ogtvwj.png | HC/11330258 |
| CLV report overview | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421797/bb47ee89838a3fd4649b916e58be/image_1lktrwc.png | HC/11330264 |
| CLV country filter | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421799/dedd014665d11a7080b21e3d96c2/image_ianj54.png | HC/11330264 |
| CLV cohort table — GIF | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421808/557aa769d308d6967156da168766/recalculatecogs3_b3ro0a.gif | HC/11330264 |
| P&L plan-limit screen | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790434682/b5b5bf4a806b0bc8a14a9a24ed21/limit.png | HC/11330268 |
| P&L date range + interval picker | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790405050/0cee0b8815f28c5f9c7c8118af21/3_+variant+and+history.png | HC/11330268 |
| P&L net profit formula tooltip | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2707544200/ce29c54994e7bbfcd14254b565bd/image.png | HC/11330268 |
| P&L Export button | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790500436/98d7b3c9be979666ef8b8066e473/4_+export.png | HC/11330268 |
| Marketing Attribution report / Conversion Report / Conversion Journey | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426385/8496af820ef3659daf6515f8be5e/image_uq14o7.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426389/53202a4fcb7f5815fec5f75f4ac8/image_19syjct.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426387/2e81d349e7449db7fa60c1f40bb3/image_v8yexo.png | HC/11330282 |
| URL Builder (beta) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1775092047/3b72d8bf39f589b8fbbd1a8eb3b5/step1.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1775090897/3de9a97e6645d67d3ae18e19c441/build.png | HC/12568948 |
| Orders Report per-order Ad Spend / Net Profit columns | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2627373704/b2d1d2b953ca2b320a4cd140db52/image.png | HC/16554887 |
| Orders Report export / import / bulk edit | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010191/a8b041d1a42836ff35d4ce68a24f/image_13rdv97.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010197/6ef1b05a41f963f0c0caf3c021fe/image_uklify.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010210/0cd3353aeb16cfd9fc1a28c9c604/image_kjvpkh.png | HC/11325271 |
| Exports: Dashboard / Product Analytics / Orders / P&L / COGS export buttons; Exports page and filter | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424168/27527da17a4c014e542914e68cf7/image_1bjhquv.png ; .../1515424175/9372b05dc94f317fcb5bee531988/image_1x5s7oy.png ; .../1515424170/43fba3e03bb78f01205e506f7ddf/image_1u81xoz.png ; .../1515424169/29cdd78b1c5bdc68caa9d55e3050/image_77q3cu.png ; .../1515424173/8b67a0ead5149e41a6fc1177dbb9/image_jzdyfa.png ; .../1515424171/00eac1c1037d723aa274079e64b4/image_ruj7wl.png ; .../1515424178/1a252b477a04659724f31d741608/image_60a530.png (prefix https://downloads.intercomcdn.com/i/o/k3mvy0bn) | HC/11330278 |
| Calculation Preferences page (three sections) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2676401795/536ab9354d48b90d8da3d083d137/e9a66fd6-8cd1-44bc-b32f-5bf32c5f529a | HC/11325268 |
| Calculation Preferences: Recording date / Substitution | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2676412183/74571b3e1c2be8b720855b875ecd/image.png | HC/11325268 |
| Default date range setting | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2592505580/f9a24f21800a40e1cc204e244bd6/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2592546338/04df0dce05e5164b8dd2bc472357/image.png | HC/11330415 |
| Account menu / display currency dropdown | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598038831/6ffa0b1bbc3912b04ef914d6afeb/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598039479/6237f883ebfe55bc78efa5574b4b/image.png | HC/11330404 |
| Store switcher + All stores | https://trueprofit-d5581ecd89bf.intercom-attachments-1.com/i/o/k3mvy0bn/1515444094/97a6c171abe2fbd620ecdf18f698/image_johut8.png ; https://trueprofit-d5581ecd89bf.intercom-attachments-1.com/i/o/k3mvy0bn/1515444100/a59a583f83723f424636009bf747/screenshot-2024-03-14-135918_37arte.png | HC/11330347 |
| Email Reports recipients / frequency / sample email | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423332/a501afb9228531faa24b0c5fb676/image_brhsmk.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423331/b4c8d88c7575e6ebad9969707773/image_qmexmz.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423330/a4402a30124e78893da081cd8fa4/screen-shot-2020-09-03-at-1747_qf1aol.png | HC/11330272 |
| Custom Email Reports wizard (5 steps) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423329/fc7823ebc4bdf446e02d1cc7a7ad/image_kocva0.png ; .../1515423338/e9c5aa8f909199c6335a93dc6c96/image_1n6yr81.png ; .../1515423336/47f62a52d1c1e1283fc199559559/image_uef23r.png ; .../1515423339/6274058ffbb13e6a7b187f46694c/image_1ubuo6g.png ; .../1515423335/171de8e73687b25b704b27c933a2/image_2x2978.png | HC/11330272 |
| New COGS page main view / review costs / enter cost | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453552/d077e37d2b38cf1df95ca48dbbba/main%2Bview.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453550/182075148fdb8316cfd421a176d5/1_%2Breview%2Band%2Bupdate%2Bcosts.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453553/fcf0a80f131378595880491f021b/2_%2Benter%2Bcost.png | HC/12381267 |
| Recalculate COGS modal (product list, effective date, progress) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2562926809/833f4ff283ea7ecd882e2afb2887/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2629402790/c11018d27b469b52e2a448286613/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2629404878/8d916bf432b3e750e4e80ecafc12/image.png | HC/16051710 |
| Handling Fees onboarding / mode choice / flat setup | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582314348/237395277ed0e3214d625e9d0b23/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582315209/2ef305df19e56b2e7b3531c91c4b/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582328627/83a4660a68fd40e2274157a52c82/image.png | HC/16065248 |
| Shipping v1 calculation settings | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992580/151004bf62a4642765e0702d95ee/image_ou4255.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992579/21f6d944811be13447df96c5884d/image_adc456.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992592/9326379b21c9f58d0afdb4787fa8/image_p638lo.png | HC/11325206 |
| Shipping v2 mini onboarding (GIF) + main view editing | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118924598/56f6c740b8e108b309973ed492d8/gif+mini+onboarding.gif ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118694685/39231634e42fd6af4169941cd139/Group%2B1171278313.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118694680/2757b6ac99605f584ce3118455aa/le.png | HC/13856923 |
| Transaction Fees page (gateway rates & fees, locked integrated fees, Shopify 3rd-party fee) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2662086704/01557c5b9d98fc5e175106254e99/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1902528914/bcfb142808e80080a3dbe8cbc114/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1891988580/f698b89dcaecdde1f21466ab8001/image.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2182716801/100a7d58ae80e4252eec4b167f8d/trrrrrr.png | HC/11325244 |
| Custom Costs add-cost modal / ongoing / categories | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1727853862/c033a42e408593cf18127b599f60/1_+navigate.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1794532210/e202f1608684bd5e5088cce39da7/o%CC%82nging.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1806158804/71aa75eadfcb66464c1a97f1b60b/image.png | HC/12289182 |
| Extract Bill with AI flow (GIFs + review table) | https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122201193/2490a372b3596ed61394976a8105/gif-extract-cost-1.gif ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122137887/7d6658fc8102a96727c11579c584/gif-extract-bill-2.gif ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122184865/21251626f3d60892561603db6673/image.png | HC/13904711 |
| Marketing channel accounts / stop syncing / campaign name filters | https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932773508/db06f75f95ff29b5f55cd718351b/account.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932891402/6ee8b118db3477645fdb527bfcc0/stop+syncing.png ; https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932895511/004ca50e7fec50666f139dc1ddc5/set.png | HC/13349042 |

## Appendix C — Full image inventory from help articles (auto-generated)

- Coverage: 462 images across the 128 articles.
- `[APP]` = the surrounding text points to TrueProfit's own UI (276 images).
- `[3P?]` = the article or context mentions a third-party UI such as Shopify admin, an ad platform, a supplier, Chrome or mobile OS screens (186 images). These may still include TrueProfit screens.
- Each "near:" caption is the closest preceding text in the article, taken automatically, so it describes the image only roughly.
- Signed query strings have been removed (see the Appendix B notes).

#### Version 1: Set up Quantity-based COGS or Bundled COGS
Source: https://helpdesk.trueprofit.io/en/articles/11325027-version-1-set-up-quantity-based-cogs-or-bundled-cogs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513924366/91ec966bda92a30e025e2e057010/original — near: "Enter the Cost per unit value for each row."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1631907392/6cd5ad8338ebd5921ca7a291e3b7/image.png — near: "(If customers buy 5+, you still use $6.25 per unit)"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513924378/6f29a06873f75dd344e394cf12a7/original — near: "toggle is set to 'Variant', the app will individually calculate quantity-based COGS for each variant, which wi"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513924379/878053531f3af852e1546a7cf6df/original — near: "to start applying and recalculate COGS for all orders in the past of the selected products/variants."

#### Version 1: Set up Cost of Goods (COGS)
Source: https://helpdesk.trueprofit.io/en/articles/11325035-version-1-set-up-cost-of-goods-cogs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513961629/532793ba1a258f1e3d8baacdc7b0/image_1ugahn.png — near: "To update a fixed COGS value, you can edit directly on the table for each product/variant. When done, remember"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513961640/4b859d71bf39860cb06d791826ff/cogs-setting-online-video-cutt_36k6jz.gif — near: "Step 2: Click Re-calculate product past orders to start applying and recalculate COGS for all orders in the pa"

#### Version 1: Add zones to manage COGS in Cost of Goods
Source: https://helpdesk.trueprofit.io/en/articles/11325050-version-1-add-zones-to-manage-cogs-in-cost-of-goods

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513981808/600b678971b18fe01ca02ef428e3/add-zone-button_1hut1he.png — near: "Click Add zone"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513981812/352f9d404ab5d8f4fd4465f2015e/image_dko0i6.png — near: "In the popup, enter a Zone name and select the countries to add to this zone"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513981802/312ad8713be3efd4ddf684ec17b3/image_1yzju4w.png — near: "When you select a new product to add to an existing zone, please do not choose the option Add all products in "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513981814/d176267d8001980e54f20dc70b68/image_1gtm5ux.png — near: "Now you can manage different COGS values in different locations and zones for the same product/variant when ne"

#### Version 1- How TrueProfit import your COGS upon installing
Source: https://helpdesk.trueprofit.io/en/articles/11325096-version-1-how-trueprofit-import-your-cogs-upon-installing

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953402/ff922e04ef4f6b6219f5a19a4dd7/image_93h2zr.png — near: "If you use Cost per item to track product costs, review the imported COGS in TrueProfit to ensure they are acc"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953409/3ebf1535d2bd64360a565b2b940c/image_9f5jge.png — near: "In the app, if a COGS value comes from Shopify, you’ll see a Shopify icon in the Source column."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953391/a87876e533ad900e2419069ad620/recalculatecogs_1t2xsdb.gif — near: "s with the synced cost:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953399/5c9cf295316e4db4d5f1c1038b39/image_1yee4i2.png — near: "To start editing the COGS value for a variant, click on the expand arrow next to the toggle button, then switc"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953421/7148805fa937f4c1f16c26a28a55/image_1u6n5o8.png — near: "If you have different COGS value for each variant, edit directly in the Cost of Goods Sold field"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953420/3dcc28d69ff809293a0029a1e5af/image_1un9p42.png — near: "manage COGS on the product level for all variants"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953410/1500473c2f248f5352e268029892/image_1p02b2c.png — near: "for your product costs, click on the history icon to start editing"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953416/4fc8a2a52889c04528b7463d35be/image_4upfbs.png — near: "to download a .csv template of all products in your store"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953412/8b690bc478e72b3398ee63841af1/image_1wmewx6.png — near: "column and fill in the product cost for each product and variant accordingly"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515734968/98e85e10f8f9acd62a8dec264fa1/image_s4ov80.png — near: "then choose the CSV file you've saved in step 2 to import it to TrueProfit"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513953415/5a8836b112adddd796aa9f02fb98/image_dplj4x.png — near: "To check the progress of importing and updating your product cost, click on the notification bell."

#### Version 1: Add & manage historical COGS (COGS in the past)
Source: https://helpdesk.trueprofit.io/en/articles/11325110-version-1-add-manage-historical-cogs-cogs-in-the-past

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515824986/b8fb63963ebb8f4545bdaefec5b6/image.png — near: "next to the Cost of Goods Sold field"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513957069/af34ca402974b41c37ea17977d70/image_10g3o7c.png — near: "to start adding your COGS in the past"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513957070/881f40c45e6bd96958e7a8687be5/image_1wt7beo.png — near: ". The preceding period will be automatically applied"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513957071/4e487301f2b53c124fa1609fcc70/image_157ieu4.png — near: "4. Add your current COGS value and review the product cost in the past to ensure the data is correct."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513957065/3c9c2d766975b61bb4c64c8c0a96/recalculatecogs_1t2xsdb.gif — near: "to start applying and recalculate COGS for all orders in the past of the selected products/variants"

#### Version 1: Set up Shipping Costs
Source: https://helpdesk.trueprofit.io/en/articles/11325206-version-1-set-up-shipping-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992580/151004bf62a4642765e0702d95ee/image_ou4255.png — near: "To open the Calculation settings, click Settings in the top right corner of the Shipping Costs page."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992579/21f6d944811be13447df96c5884d/image_adc456.png — near: "Calculation rules in an order (for different products)"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992582/b49f3647cdb4c8325342d1ab2fac/image_jk3gf3.png — near: "If you enable this setting, when an order has 2 items/variants of the same product with a shipping fee of $3 p"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992592/9326379b21c9f58d0afdb4787fa8/image_p638lo.png — near: "To help you visualize this setting better, we've added an example order in this section. When you make a chang"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992595/5f587a17704c5e07e64741362ca7/default-shipping-cost_p1ol76.gif — near: "The Default zone is the default setting that applies to all locations and products in your store."
- [APP] https://trueprofit-d5581ecd89bf.intercom-attachments-1.com/i/o/k3mvy0bn/1513992638/22cfcf6ae2fd6cb2323a06b04b87/custom-shipping-cost_7na24c.gif — near: "Select the countries you want to add to this zone. Note that in the United State, you can add each state separ"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513992590/22ee59bac5b190058bca5c42437d/image_14gmi85.png — near: "After you've made edits in the Shipping Costs settings, the app will save your setting to apply to future orde"

#### Version 1: Set up quantity-based and weight-based Shipping Costs
Source: https://helpdesk.trueprofit.io/en/articles/11325209-version-1-set-up-quantity-based-and-weight-based-shipping-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994833/10c12efcb2f88e55651c371dd343/shipping-cost_1bhsn0c.gif — near: "The weight-based rule uses the order's total weight to calculate shipping cost."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994834/2c8c0a68c3faef95e48fb4739ead/image_fijqk5.png — near: "If your store has one flat shipping cost for all orders, we recommend editing this field to apply one shipping"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994830/53fd2b8f3ffa02a026db6e927314/image_jvdeo0.png — near: "Adding quantity break in the Shipping Cost setting lets you manage different cost ranges based on the purchase"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994835/f18841af6e5572f3b7fefda79eb3/image_glcgma.png — near: "Step 3: Enter the Shipping cost value for each row."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994840/f771f1664f6cab1dabc21567b3aa/image_vl5gcj.png — near: "That means your input in each row will be as follows:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994842/a71aa65a44583e1c80bab340394a/image_1achy62.png — near: "If unchecked, each product added to the group will be counted separately when applying your quantity break set"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994848/00e26f320c08978940cef08b793c/image_fs8e1m.png — near: "Once you've done editing the quantity-based costs, remember to click button Re-calculate past orders to apply "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994847/65c813d6329844ea9cd1181e7497/recalculatecogs3_c8e0ae.gif — near: "The weight-based Shipping Costs rule is an available setting in product groups, including the default group in"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994843/80701661fbc83fd8f82207903433/recalculatecogs3_1j99jr1.gif — near: "Step 3: Enter the Shipping cost value for each row."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994844/dd855f0956b529d4b63bd8d7dbf0/image_1achy62.png — near: "If unchecked, each product added to the group will have separate weight value when applying your weight break "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513994845/6374eedf83b0fb61c25f4868eaa5/image_fs8e1m.png — near: "Once you've done editing the quantity-based costs, remember to click button Re-calculate past orders to apply "

#### Version 1: Create Product groups to add Shipping Cost for specific products
Source: https://helpdesk.trueprofit.io/en/articles/11325214-version-1-create-product-groups-to-add-shipping-cost-for-specific-products

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997008/c861978f5053e4d44ffa3f7abe7d/image_1b4de3r.png — near: "Click on the Default zone, here you will see the Default Product group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997007/a51b9a90ef65d40215c05b5032cd/image_1vpp96v.png — near: "In the Default zone or a Custom zone, click on Create product group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997011/b26ad141de77d01ef3ab0da08fa5/image_c8ecwt.png — near: "Enter a group name, then click Add products to select the products you want to add to the group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997026/455fd01ac76308facdacd5645944/image_1wb8wg0.png — near: "In the Edit product pop up, you can click on the filter button to view just the products you want. If you want"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997021/d558f876c85dc7ceaa9b0a123af6/image_1uavw5q.png — near: "Ship all items together option: This option will change the final shipping cost value if you added quantity br"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997028/c11df2770047e1084498b03a78a5/image_kib227.png — near: "If you have different shipping costs between locations, you can Duplicate a Custom zone to save time on creati"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513997006/334c6a428c070d7acbbe9deb0fd4/image_14gmi85.png — near: "After you've made edits in the Shipping Costs settings, the app will save your setting to apply to future orde"

#### Version 1: Calculation settings for Shipping Costs
Source: https://helpdesk.trueprofit.io/en/articles/11325219-version-1-calculation-settings-for-shipping-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513998067/cf92e429354c70932f5c99292e6d/image_ou4255.png — near: "To open the Calculation settings, click Settings in the top right corner of the Shipping Costs page."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513998069/813baaa110d9c796ae4162b97c05/image_adc456.png — near: "Calculation rules in an order (for different products)"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513998068/87c582966c203d944a80a22585a8/image_jk3gf3.png — near: "If you enable this setting, when an order has 2 items/variants of the same product with a shipping fee of $3 p"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1513998070/c12bbcffe4a9d2e82ac5afbb508c/image_p638lo.png — near: "To help you visualize this setting better, we've added an example order in this section. When you make a chang"

#### Set up Transaction Fees
Source: https://helpdesk.trueprofit.io/en/articles/11325244-set-up-transaction-fees

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2662086704/01557c5b9d98fc5e175106254e99/image.png — near: "= Payment Gateway Fee + Shopify Fee for 3rd-Party Payments"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1902528914/bcfb142808e80080a3dbe8cbc114/image.png — near: "1.1 If a payment gateway fee looks wrong, update it in the Rates & Fees section. TrueProfit will automatically"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1891988580/f698b89dcaecdde1f21466ab8001/image.png — near: "Even if you manually edit rate and fee in the transaction fee page, it won’t change the transaction fees in Or"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1891981202/9a544d4654c0ba9876a49787b8e1/image.png — near: "0.6% (3rd-party payment providers)"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2182716801/100a7d58ae80e4252eec4b167f8d/trrrrrr.png — near: "Note: If you're on the Shopify Plus plan with Shopify Payments active, Shopify waives this fee entirely (0%) a"

#### Set up Taxes Paid
Source: https://helpdesk.trueprofit.io/en/articles/11325259-set-up-taxes-paid

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1804044814/ef21df9877ca5c4d4750d60d8404/o-CC-82nging.png — near: "Recurring cost or ongoing cost: Select only the Start date. End date is no needed. Click the x to remove end d"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1804045289/fddc2026c1bec95900de6796bc31/image.png — near: "Select Taxes Paid or add a category by typing"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1804042215/e2f704eb3f9fcc4ef35b4a904749/image.png — near: "In the amount section (% list), we have all the same options as before"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1804050477/ed6a07d591cab2a97abdd799a8a6/image.png — near: "Note: In dashboard, the cost breakdown section or in the P&L report, taxes paid will one of part of custom cos"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1806137014/b4ae12782ba1586ec60faba50978/tx21jqgi41_jjvm1p.png — near: "Net Profit = Revenue + Tips + Gift Card Sales - Total Costs - Taxes Collected - Chargeback Loss - Chargeback F"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1806137015/cd75953bd04f76180d6b562f4f8e/image_k25s6h.png — near: "The Taxes Collected in TrueProfit will match this report on your Shopify store:"

#### How to use Calculation Preferences
Source: https://helpdesk.trueprofit.io/en/articles/11325268-how-to-use-calculation-preferences

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2676401795/536ab9354d48b90d8da3d083d137/e9a66fd6-8cd1-44bc-b32f-5bf32c5f529a — near: "The page opens with three sections, top to bottom: Profit calculation rules, Recording date, and Default setti"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2676412183/74571b3e1c2be8b720855b875ecd/image.png — near: "3. Substitution: Substitution date (default) or Order date"

#### Bulk editing order costs in Orders Report
Source: https://helpdesk.trueprofit.io/en/articles/11325271-bulk-editing-order-costs-in-orders-report

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010191/a8b041d1a42836ff35d4ce68a24f/image_13rdv97.png — near: "Choose the date range that includes the orders you want to edit costs for"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010197/6ef1b05a41f963f0c0caf3c021fe/image_uklify.png — near: "Click Export to download the CSV file and use it as your file template"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010210/0cd3353aeb16cfd9fc1a28c9c604/image_kjvpkh.png — near: "Note: Make sure you made no changes to the column names or the layout of the file to import it successfully."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010193/a4833b04735fae919a385695b666/image_1ev5urx.png — near: "Click Import to upload the file back to TrueProfit and wait a moment for the app to update your order cost"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010207/1f4a3df308fa43d0f23cfcdb7832/image_1jy64t5.png — near: "Select the orders you want to edit in bulk"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010208/ffb2765485491067d631e1202d3f/image_zxebdr.png — near: "Click Bulk Edit > Select a cost value from the dropdown menu."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514010203/6ae3d532a8ea29be28cdd8f74a10/image_1er6dl1.png — near: "In the editing modal, you can edit the value for each order separately or apply one value to all orders at onc"

#### FAQ: How to set shipping cost as 0 (free shipping)?
Source: https://helpdesk.trueprofit.io/en/articles/11325277-faq-how-to-set-shipping-cost-as-0-free-shipping

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514012103/7ba75d1b78ac33985b78a6878ee6/image_1s631h4.png — near: "If you want to update your current Shipping Cost to 0, go ahead and change the cost value in the Default zone "

#### FAQ: Are your order costs not updating?
Source: https://helpdesk.trueprofit.io/en/articles/11325281-faq-are-your-order-costs-not-updating

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514013267/741415988bef67a5f6cbaafcdccd/recalculatecogs_1t2xsdb.gif — near: "Step 3: Click Re-calculate product past orders to start applying and recalculate COGS for all orders in the pa"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514013268/89e203042666aac37ad7dcc45192/image_14gmi85.png — near: "After you've made edits in the Shipping Costs settings, the app will save your setting to apply to future orde"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514013269/e881cd9cae3c46f7804937af8ec8/image_o0nif2.png — near: "After you've edited any fees in the Transaction Fees settings, the app will save your setting to apply to futu"

#### FAQ: How do I change sale prices in TrueProfit?
Source: https://helpdesk.trueprofit.io/en/articles/11325288-faq-how-do-i-change-sale-prices-in-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515564311/adf7a51bd0553953b991a31d9a15/image.png — near: "Sale prices are pulled in automatically from Shopify. In case you need to make changes to sale prices, you'll "

#### How to set up custom costs for specific orders using order tag
Source: https://helpdesk.trueprofit.io/en/articles/11325290-how-to-set-up-custom-costs-for-specific-orders-using-order-tag

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514015074/57b2bfc1d42be4e5202ec276721d/image_1mftlh3.png — near: "If you don't choose any order tags, the custom cost will be calculated based on % Revenue for all orders."

#### FAQ: What are the differences between Taxes Collected and Taxes Paid?
Source: https://helpdesk.trueprofit.io/en/articles/11325292-faq-what-are-the-differences-between-taxes-collected-and-taxes-paid

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514015951/117f70a6ed684f6b3012f0274c5c/tx21jqgi41_jjvm1p.png — near: "Net Profit = Revenue + Tips + Gift Card Sales - Total Costs - Taxes Collected - Chargeback Loss - Chargeback F"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514015950/1211235be63fbeeaae12db7ce689/image_k25s6h.png — near: "The Taxes Collected in TrueProfit will match this report on your Shopify store:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514015957/b2e7deeede61f5b0f128a6127879/image_h6z7qq.png — near: "Total Cost = Cost of Goods Sold + Handling Fees + Shipping Cost + Ad Spend + Transaction Fees + Custom Costs +"

#### Connect Facebook Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325313-connect-facebook-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272872856/017efea04b73d86cb886520029bd/1_+step+1.png — near: "Facebook Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272876510/a9f9118ea6b4354aa27d94a3409e/image+316.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272886588/f2854ac40f2a09d8b4f4fca2308a/account.png — near: "next to it.​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272886591/e35475236bedc3479ecb8d70da1e/add-2Baccount.png — near: "and choose the ad accounts you want to sync with TrueProfit. You can always add more ad accounts later."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275791062/594a624e4778a4d72e1f2747e799/stop+syncing.jpg — near: "Stop Syncing"

#### Connect TikTok Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325316-connect-tiktok-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272955785/08642b0d0471e9f61070f1a71181/tiktok.png — near: "TikTok Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2272963082/bce0fc73bae9b80ceabbc8519c98/image.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275770008/fbce18b25c7edaa26dfe7df5d899/stop+syncing.jpg — near: "and choose the ad accounts you want to sync with TrueProfit. You can always add more ad accounts later."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275785580/f45dd08431bd39e59717651a72fb/select.jpg — near: "to start syncing your TikTok ad spend data."

#### Connect Microsoft Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325318-connect-microsoft-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2372669092/fd4f0bfc9feca76df70110d14f75/micro.png — near: "Microsoft Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2372670062/ed3d45803463670e5a286fed275f/image.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2372678762/b2988cfd355b51024080dbb0bb08/authen.png — near: "If you are not already logged in to your Microsoft account, log in first. Then follow the prompts to confirm t"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2372708864/5aa2a483b5accd5cf34d7319a12f/mic+disconnect.jpg — near: "next to it.​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2372711925/491fc48b5b858a6cc46666a25543/mic+stop.jpg — near: "Stop Syncing"

#### Connect Pinterest Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325323-connect-pinterest-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2280201312/4dd4af35c92d16633ab3c4317217/pinterest.png — near: "Pinterest Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2280203034/a605e02182ecc73a52988381e812/image.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2280204186/cc43648554ec29ed09d0c2f6bf09/stop+syncing+pin.jpg — near: "next to it.​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2280238709/27924d22f1ab35ad89c8f8b47595/pin+select.jpg — near: "to start syncing your Pinterest ad spend data."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2359689640/c601d74e6f46749ff9a106fe9c0b/giffff%2Bpin.gif — near: "Pinterest updated its integration, so existing Pinterest connections in TrueProfit need to be refreshed to con"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2359689335/7afaaacfddc6171c30dfa0b2816b/cuu+1.jpg — near: "Disconnect"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2359695772/0ba944198e9d7a9582ec8eff9cd3/cuu+3.jpg — near: "to reconnect and resume syncing your Pinterest data."

#### Connect Snapchat Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325329-connect-snapchat-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2387175153/860684291e4298bbac7c3f85e03d/snap+111.png — near: "Snapchat Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2384172228/e36294aa2ca213a9d82a6f01f24b/image.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2387168967/0a6d2aa9108ccb771c558c0ba5a4/snap.png — near: "If you are not already logged in to your Snapchat account, log in first. Then follow the prompts to confirm th"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2387221562/6d53a9066bbe876e0fb6f1bd9f22/disconnect+snap.jpg — near: "if you want to connect more accounts."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404336276/ed39c5f72b3c95aa6967f3530f9d/snappppp.jpg — near: "and choose the ad accounts you want to sync with TrueProfit. You can always add more ad accounts later."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2387221081/2d66ccac91f924e68f3d2a064d04/snap+stop.jpg — near: "Stop Syncing"

#### Connect Amazon Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325334-connect-amazon-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404390751/a63e4507257f56dff68b129c6e0a/amazon.png — near: "Amazon Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2387895582/d7ae3ff4417daaa64e086cf7769e/Screenshot+2026-05-15+at+16_17_39.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2400870649/5b3ef8a2ea8e30d22a5ca8bae9ab/image.png — near: "Click "Allow" to connect"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404376478/1bbf80c42c30c8c0341acca28c32/disconnect+amazone.jpg — near: "and choose the ad accounts you want to sync with TrueProfit. You can always add more ad accounts later."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404385520/61b97fab1b829b255758df392782/stop+syncing+amazon.jpg — near: "Stop Syncing"

#### Connect X Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325337-connect-x-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2400801204/7b7157dafbf0a5707386f39cf8ca/image.png — near: "X Ads"

#### Connect Taboola Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325340-connect-taboola-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404465206/10bcca85dc6b90ef1598e0e19895/tabloo.png — near: "You will see a list of available marketing channels you can connect. Click Taboola Ads."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2404466063/58808d61b73cebffc9bbf28cbef8/image.png — near: "Step 3: Enter your Client ID and Client Secret provided by Taboola."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514031271/3dce213e7bc80be097aff6a90dd5/taboola-smol_1ywglvu.gif — near: "Before connecting Taboola to TrueProfit, you'll need your Client ID and Client Secret credentials generated fr"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514031258/d3c0d7e4e278436b28b283c70a0d/image_a22o4p.png — near: "HERE"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514031257/56fa705ab5e04fd865655eca9194/image_ps820p.png — near: "In the bottom right corner, click to open the live chat popup"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514031261/08942b4854780a398970acf16b72/image_1lx2xan.png — near: "Click Send us a message"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514031255/788f0f1f7e70386bef126590fbe0/image_1eamm0i.png — near: "Select Generating API Credentials/Key"

#### Connect with CJ Dropshipping
Source: https://helpdesk.trueprofit.io/en/articles/11325346-connect-with-cj-dropshipping

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034367/e3a45a89e0669cd93cd99e571ef7/image_10ypjdz.png — near: "If you are using CJ Dropshipping as the supplier for your Shopify store, connect it to TrueProfit now to auto-"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034365/cb6721cbe7e4d996adf4f6da66f5/image_fxosp3.png — near: "Click Connect for CJ Dropshipping"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034364/b5505ec88efb039e22e0f09076f8/image_11h8y53.png — near: "Click on My CJ button in the top bar"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034366/b7acd39b6efbc5d23038502769d9/image_1vn1fvv.png — near: "From the left side bar, hover your mouse on the Authorization card and select API"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034369/e2ac437cf6f9a39cd9f4e686c43a/image_kv27vz.png — near: "Switch the tab to API Key, then click Generate"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2570354649/f07f433a45fe704827e50462a124/CJ+LA%CC%A3I.jpg — near: "Note: only copy the alphanumeric string after the last @ and paste it into the API Key field in TrueProfit. Do"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514034375/b7d2d27bab79df2985caa6742665/disconnectcj_1wkcqyp.gif — near: "In case there was a typo in the API Key you entered to TrueProfit, please wait at least 5 minutes before tryin"

#### Integrate Dropshipping Platforms with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11325353-integrate-dropshipping-platforms-with-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514035324/18752c7f605ed456da4cedd319a0/image_n3kz5d.png — near: "In the left side menu, click to expand the Integrations section, select Dropshipping Platforms"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514035328/3f4ed499e1bd7d267a6bad350c8f/image_1arbaug.png — near: "To start connecting your CJ Dropshipping account with TrueProfit, click Connect"

#### Connect Shipping Providers and sync Shipping Costs
Source: https://helpdesk.trueprofit.io/en/articles/11325365-connect-shipping-providers-and-sync-shipping-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037296/d269c9250e42903f51ec4af6b502/image_pszbjc.png — near: "In the Integrations section, click on Shipping Providers"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037303/befa48a03d46e31a6e28fb9d7204/image_9ti0xi.png — near: "Choose the provider you’re using, click on Connect."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037304/81993d726a92a7c98701c82ced0a/shippo_bvyxyn.jpg — near: "In the Live Tokens section, copy your token from the Manage Your Tokens or generate one."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037295/b24efb8ce40c7255e16766abf8da/image_fx72r5.png — near: "Then enter your API Token and choose the currency you are using on Shippo to complete connecting."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037310/26562f7eeb913da9046500f25b07/shipstation_jrc2kf.jpg — near: "Copy your API Key and Secret or Generate new ones."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1714339690/b7e8795824fa5300ce55d332d133/image.png — near: "Version 1: Paste ShipStation API key, API secret key"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1714340534/6a5d1f08affc2a5e0b2cd64a7688/image.png — near: "​Version 2: API secret key only"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037307/f116eedfbb016658c23ce7f3f7e5/image_ps46wg.png — near: "Enter your Shipwire Username and Password, then choose the currency you are using to complete connecting."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037306/a53fa25fb3033826ad838b11b5ea/shippingeasy_qhjpta.jpg — near: "Note: Your access to the API is disabled during the free trial at ShippingEasy, this means you can't integrate"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037299/ce1c514f4d288e339e547199d589/image_1ihridb.png — near: "Enter your API Key and API Secret Key, then choose the currency you are using on ShippingEasy to complete conn"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037311/93cca929777635be2fb12c55a9de/screenshot-2023-03-17-115818_1kmp5me.png — near: "ShipBob support"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037300/bcf17b9d5cd68edd1ad93108181d/image_17u7xfv.png — near: "Enter the token then choose the currency you are using on ShipBob to complete connecting."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037301/e0f2ab63f14f9607d087aa1603a7/image_9jxiew.png — near: "Connect using your Shiphero account login credentials"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037315/73c1321734a6db1989cfdf197f65/image_10j84pl.png — near: "Then add a new third-party developer to generate a token"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037317/6fddc5cda71c86634de155358362/image_ods20l.png — near: "Now you have a Refresh token, please copy the Refresh token and paste it to True Profit"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514037298/0a90c74dc4129c8d8cea20821833/image_136d2fn.png — near: "Enter your Shiphero currency and click Connect to complete connecting."

#### What if my store currency differs from my ad account currency?
Source: https://helpdesk.trueprofit.io/en/articles/11325376-what-if-my-store-currency-differs-from-my-ad-account-currency

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514039679/b9d0d8a1a7470c8384b0a180a20f/image_78h57y.png — near: "In case you want TrueProfit to display a different currency, choose your in-app currency on the top right corn"

#### Troubleshooting Google Ads connection
Source: https://helpdesk.trueprofit.io/en/articles/11325378-troubleshooting-google-ads-connection

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514041175/46c1577d85af01172792a60ee3d9/google-access_oe6f4u.png — near: ", find TrueProfit and click on Remove access."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514041173/931240e81c8f91cdee19882f2a46/image_6ngnn6.png — near: "In TrueProfit, go to the Marketing Channels page in the Integrations section, select Google Ads then click Rec"

#### Create a TrueProfit account
Source: https://helpdesk.trueprofit.io/en/articles/11325510-create-a-trueprofit-account

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1514084583/f37cc039e03597b061cdd827ffa9/create-account_1o3vm09.gif — near: "Another quick way for you to create a TrueProfit account is clicking on the account icon in the top right corn"

#### Add a store to your TrueProfit account
Source: https://helpdesk.trueprofit.io/en/articles/11329822-add-a-store-to-your-trueprofit-account

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353160/b08f43fc0f42982d4019a37ae980/image_6c7a9n.png — near: "If you're running more than one store on Shopify, you can add all of them to TrueProfit to track Net Profit ac"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353158/52efaf4b209a3a7520c191f902f0/image_18df11v.png — near: "Manage Stores & Members"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353165/40f8f4f16654d300193f8706b5ec/image_1jq8g18.png — near: "Add Store"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353171/857a8a43c5c220efc2e3ef996c21/image_otinbr.png — near: "Add a Store"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353163/4eabcf94e9d11ff314e93c39d95c/image_pk04h9.png — near: "of your store to complete adding it to your current TrueProfit account."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353170/980fa7f2a048b34e57e55e5d7783/image_ggrxuj.png — near: "​At the top of the app, you can find a dropdown to switch between added stores and shared stores in your TrueP"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515353166/0959de3c475dd11b3271ac6b99b6/image_2ep54g.png — near: "view."

#### Manage your social sign-ins
Source: https://helpdesk.trueprofit.io/en/articles/11329853-manage-your-social-sign-ins

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515357086/d059957c583741406434b27fe065/aa_2b2nsv.gif — near: "3. Here, choose either Google or Apple account to connect with your TrueProfit account. Once the authorization"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515357082/11cbc8c721bccd32fc1e77f8de08/image_1f6bm6t.png — near: "then connect with a different account after that."

#### How to cancel your subscription
Source: https://helpdesk.trueprofit.io/en/articles/11330217-how-to-cancel-your-subscription

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400622/372d531a4fba30576dcc726db18c/image_aw6axi.png — near: "of your store."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400621/a50da907887d1bc0ae6980d0f2ee/image_1vu7tde.png — near: "More options"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400628/66c7faf2c43d37f26fc3ef459246/image_jdnwpd.png — near: "in the Cancel subscription section to continue"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400627/fa5557fc5291eaf9f67edc37245d/image_r77ypv.png — near: "4. Now, there are two options for you to cancel your current subscription:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400631/9a99feac7d2f91e1155af89ce1a7/image_i9is64.png — near: "Continue"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515400632/0cf78cfe87a197c04fc43d84c3fd/image_1sx3m3e.png — near: "and enter your own. We read your feedback very carefully to improve our product."

#### How to apply a promo code in TrueProfit Pricing
Source: https://helpdesk.trueprofit.io/en/articles/11330221-how-to-apply-a-promo-code-in-trueprofit-pricing

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515403750/34a2701fa2eb460f36ed6bbd8eaf/image_8ew2vh.png — near: "field."

#### Add team members to your stores
Source: https://helpdesk.trueprofit.io/en/articles/11330222-add-team-members-to-your-stores

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404957/e501f8f7bfe159bcaecb653b8b05/image_167w934.png — near: "Create Account"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404960/14ff4721ead28829751c78e4b6ac/image_ajvxk0.png — near: "Sign up"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404953/77470e0d5b4926559ab875519eed/image_18df11v.png — near: "page from your account menu"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404962/98eca3865432318062016c9d53b4/image_fkhwji.png — near: "Add member"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404964/08ecd2f5fde7077cb681d71ea92d/image_18zovq3.png — near: "3. Enter the email address, and assign a role: Admin, Viewer, or Editor, to the new member."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404958/c1ac53f8107e0593f1c2732bdabd/image_tz7r74.png — near: "Send invite."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515404959/d2fd6a874f0fe4d501ce24ff74d6/screenshot-2024-03-14-154854_1hzdys9.png — near: "or deleting them from that store."

#### Install TrueProfit Pixel for Product Analytics
Source: https://helpdesk.trueprofit.io/en/articles/11330252-install-trueprofit-pixel-for-product-analytics

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1547929746/3cdf1d11fa497eb7787b5ecf3491/image.png — near: "on TrueProfit:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515418193/cfa890ced228b2675d8240bd6304/screenshot-2023-10-11-134528_lpkdtw.png — near: "below"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1518804716/6bb9b227313eca7e2633c460baef/screenshot-2023-10-11-154611_1bbvnsh.png — near: "Your URL parameter will look similar to this:"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515418195/57bf5d86aad6c29a29ee712953dc/screenshot-2023-06-02-152427_1uel21v.png — near: "1. Sign in to your Shopify account, click Online Store from the left sidebar > choose Theme​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515418194/eddc7467965c475244e9987902cc/screenshot-2023-06-02-153217_ohnk3x.png — near: "2. Click the Customize button to edit your current theme"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515418200/04d8aa001988aea40a9519f46a45/group-1000002499_1auf56w.png — near: "​3. In the left sidebar, click on the App embeds icon, search for TrueProfit and toggle it on."

#### Product Analytics Overview
Source: https://helpdesk.trueprofit.io/en/articles/11330258-product-analytics-overview

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1547920228/6801c07cd962a8db31dd6d59b526/image.png — near: "To enable tracking for the Product Analytics report, please complete the following steps:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419422/88e2f7200e3d8d3d5259824f3b47/screenshot-2023-10-11-134528_lpkdtw.png — near: "below"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1547919278/9cd327d6002490a1042359fc0b59/image.png — near: "to turn it back on and see all your product analytics data."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419432/7479697bf172f6110839c114580b/image_1ogtvwj.png — near: "Product Analytics Overview"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419423/cd6a781b2055777af7a6800617d6/screenshot-2023-06-02-152427_1uel21v.png — near: "1. Sign in to your Shopify account, click Online Store from the left sidebar > choose Theme"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419427/56f46646ceead1daf7d720dbb21e/screenshot-2023-06-02-153217_ohnk3x.png — near: "2. Click the Customize button to edit your current theme"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515419428/ff8f92d25357b1d83b6f5ce088ce/group-1000002499_1auf56w.png — near: "3. In the left sidebar, click on the App embeds icon, search for TrueProfit and toggle it on."

#### Customer Lifetime Value Report
Source: https://helpdesk.trueprofit.io/en/articles/11330264-customer-lifetime-value-report

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421797/bb47ee89838a3fd4649b916e58be/image_1lktrwc.png — near: "Understanding the Customer Lifetime Value report​"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421799/dedd014665d11a7080b21e3d96c2/image_ianj54.png — near: "In particular, the country filter allows you to see from which country your customers are generating more valu"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515421808/557aa769d308d6967156da168766/recalculatecogs3_b3ro0a.gif — near: "Below that you can find insightful tables and charts as well."

#### Profit & Loss (P&L) Report
Source: https://helpdesk.trueprofit.io/en/articles/11330268-profit-loss-p-l-report

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790434682/b5b5bf4a806b0bc8a14a9a24ed21/limit.png — near: "Use a Viewer or Admin role. If you’re on another role like editor, ask your store owner/admin to change your r"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790405050/0cee0b8815f28c5f9c7c8118af21/3_+variant+and+history.png — near: "In the top-right of the P&L Report, pick a date range and a display interval (Daily/Weekly/Monthly)."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2707544200/ce29c54994e7bbfcd14254b565bd/image.png — near: "Net Profit = Revenue + Tips + Gift Card Sales - Total Costs - Chargeback Loss - Chargeback Fee"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1790500436/98d7b3c9be979666ef8b8066e473/4_+export.png — near: "Exports"

#### Set up Email Reports
Source: https://helpdesk.trueprofit.io/en/articles/11330272-set-up-email-reports

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423332/a501afb9228531faa24b0c5fb676/image_brhsmk.png — near: "2. TrueProfit will send a confirmation email to this address, make sure you confirm your email to start receiv"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423331/b4c8d88c7575e6ebad9969707773/image_qmexmz.png — near: "3. Below that is the Sending frequency section where you can choose the frequency to receive the email reports"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423330/a4402a30124e78893da081cd8fa4/screen-shot-2020-09-03-at-1747_qf1aol.png — near: "4. Once done, you will receive a report email similar to this:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423329/fc7823ebc4bdf446e02d1cc7a7ad/image_kocva0.png — near: "1. From the left side menu, in the Store Settings section > select Custom Email Reports"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423338/e9c5aa8f909199c6335a93dc6c96/image_1n6yr81.png — near: "2. Click Create report to get started"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423336/47f62a52d1c1e1283fc199559559/image_uef23r.png — near: "3. Enter a name for the report, then add the recipients, and choose the frequency you want, then click Next"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423339/6274058ffbb13e6a7b187f46694c/image_1ubuo6g.png — near: "4. Choose the metrics you want to include in your report. In the review section, you can edit the email title "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515423335/171de8e73687b25b704b27c933a2/image_2x2978.png — near: "5. Review your report, then click Finish to complete setting up your Custom Email report."

#### How to export data and reports on TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11330278-how-to-export-data-and-reports-on-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424168/27527da17a4c014e542914e68cf7/image_1bjhquv.png — near: "In the top right corner of your Dashboard, find the three dots button to open more actions, including exportin"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424175/9372b05dc94f317fcb5bee531988/image_1x5s7oy.png — near: "In the top left corner of the Product Analytics table, you will find the Export button. After you've clicked E"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424170/43fba3e03bb78f01205e506f7ddf/image_1u81xoz.png — near: "In the top left corner of the Orders Report table, you will find the Export button. After you've clicked Expor"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424169/29cdd78b1c5bdc68caa9d55e3050/image_77q3cu.png — near: "In the top left corner of the P&L Report table, you will find the Export button. After you've clicked Export, "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424173/8b67a0ead5149e41a6fc1177dbb9/image_jzdyfa.png — near: "In the top left corner of the Cost Of Goods settings, you will find the Export button. After you've clicked Ex"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424171/00eac1c1037d723aa274079e64b4/image_ruj7wl.png — near: "In the left side menu, you can find the Exports page where all export files from all pages are saved. TrueProf"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515424178/1a252b477a04659724f31d741608/image_60a530.png — near: "The Export page can be filtered by page to help you find the file you need easier."

#### Overview: How does marketing attribution work in TrueProfit?
Source: https://helpdesk.trueprofit.io/en/articles/11330282-overview-how-does-marketing-attribution-work-in-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426385/8496af820ef3659daf6515f8be5e/image_uq14o7.png — near: "When your ads convert a successful purchase, you'll start seeing data reported in the Assisted Purchases and L"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426389/53202a4fcb7f5815fec5f75f4ac8/image_19syjct.png — near: ": When you click to view the Assisted Purchases and Last-clicked Purchases data in your report, you will see a"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515426387/2e81d349e7449db7fa60c1f40bb3/image_v8yexo.png — near: "​The Conversion Journey gives you the full record since the customer first clicked on to view your ads, counts"

#### Install TrueProfit Pixel and set up URL parameters
Source: https://helpdesk.trueprofit.io/en/articles/11330283-install-trueprofit-pixel-and-set-up-url-parameters

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752141994/95a86b62e41d45a7608531069108/3_+ca%CC%82%CC%80n+authorize+o%CC%9B%CC%89+dashboard.png — near: "Go to authorize"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752142484/2df66f7c01fec1c005e6c6643769/3_+ca%CC%82%CC%80n+authorize+o%CC%9B%CC%89+step+1+MA.png — near: ": All tracked data is secure and used only to improve your reporting and attribution accuracy."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752142978/16b9a9ef2654c463ce4ef5cb3ef7/1_+auto+luc+install.png — near: "No action is required. During installation, you already authorized TrueProfit Pixel to access your store data."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752143153/15745e761063e7d456e4918db6c8/2_+ko+ca%CC%82%CC%80n+authen+MA.png — near: "✅ Installing the TrueProfit app automatically completes this step for new users."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752144196/57aa8e704073c58a62de35dc57b4/4_+themze+customize.png — near: "Sales channels > Themes"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752144416/cdf42e278143af2bc8d5f3b73f3b/5_+save+app+embed.png — near: "Save"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1752161102/afe614b2629c2ea3c7844ff11262/6_+extension+parmameter.png — near: "How to use the extension"

#### Add tracking parameters for Facebook ads using Chrome extension
Source: https://helpdesk.trueprofit.io/en/articles/11330286-add-tracking-parameters-for-facebook-ads-using-chrome-extension

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428082/15e0a0ea4ecd9b38df2b31a0bc1b/image_eff0by.png — near: "Open the edit page of the ad you want to add parameter to. Make sure you are on the ad level to add the parame"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428087/a0755263f00aea3b48095b117dda/image_5l8lx4.png — near: "Scroll down to the URL parameter section​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428081/babd827f436a33ecf1a080e94175/image_1y1f0on.png — near: "follow this guide"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428080/fc0ad41f34ba0f5609bec648de86/image_dl8aej.png — near: "Add the tracking UTM similar to the image below"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428084/2a8ce4aeee5e054f5c0e5978c5b9/b6c61fa6-36c6-4ab2-947e-cae593_aqfu4a.png — near: "If you already have parameters in use, make sure to add an ampersand at the start of TrueProfit's parameter. F"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428085/eb45f7d8a695d8a86faa7d7a8c2d/screenshot-2023-08-22-152949_frlp3r.png — near: "If you are running ads for a product, find the product ID from Shopify like the instructions below. If you are"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428088/448daee1feed3b4e99bd07b32c49/image_ne1thd.png — near: "1. Click to open the Customize column modal"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515428096/98e0c4d6f45a6254ae0706cb17b0/image_16zbotd.png — near: "2. Add the URL Parameters column to the table and review all parameter you added"

#### Install and use TrueProfit Parameter Generator Extension
Source: https://helpdesk.trueprofit.io/en/articles/11330289-install-and-use-trueprofit-parameter-generator-extension

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429109/fa2fffd09289ee13ea376d0ed6b5/image_1fximaa.png — near: "from Chrome Web Store and add it to your Chrome browser."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1656407372/4ea34963dd404e31804aa221bc19/image.png — near: "and connect it to your store."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429110/6dff98bd0c3e2796a232365f0b4f/shopify_zk8fvm.png — near: "Once you've signed in, the extension will look like this:"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429107/62a403d07b9a6e45a191a2e802d8/parameter_1tcrjav.png — near: "After you've finished choosing the Ad Platform, Store, and Product for your ad, you will find a parameter gene"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429119/d540f828833dfaf1ef21707a0feb/image_70i6m6.png — near: "before adding TrueProfit's parameter."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429112/443f96242db9932829f65cd7d20e/340c2c89-2bd8-43bf-8482-c613e3_4k4et3.png — near: "Make sure you separate the parameters from the URL with a question mark. For example:"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429106/cf324a930a7b39d296f8377e5df6/b6c61fa6-36c6-4ab2-947e-cae593_aqfu4a.png — near: "If you already have parameters in use, make sure to add an ampersand at the start of TrueProfit's parameter. F"

#### Set up URL Parameters manually for your ads
Source: https://helpdesk.trueprofit.io/en/articles/11330291-set-up-url-parameters-manually-for-your-ads

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429482/7e1bc03e8e9fc8f96941b9813c13/screenshot-2023-08-08-133349_83o2m5.png — near: "with these platforms: Facebook, Google, TikTok, Snapchat, Pinterest, Microsoft (Bing), and X Ads."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429474/f59ff7cda3dec6d79730a980ad9e/screenshot-2023-08-22-152949_frlp3r.png — near: "tp_productid=the product's ID from Shopify : In your Shopify Admin, go to Products and choose the product you "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429477/d4c9099eacc2d880c00520ec0bf8/image_70i6m6.png — near: "before adding TrueProfit's parameter."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429476/ee320610077ee4862f664e7c1aa9/340c2c89-2bd8-43bf-8482-c613e3_4k4et3.png — near: "Make sure you separate the parameters from the URL with a question mark. For example:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515429479/a9f0dc86ffb9281f92679732c826/b6c61fa6-36c6-4ab2-947e-cae593_aqfu4a.png — near: "If you already have parameters in use, make sure to add an ampersand at the start of TrueProfit's parameter. F"

#### Changelog
Source: https://helpdesk.trueprofit.io/en/articles/11330293-changelog

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2600389076/32af688b81e667b0e71059ebff32/image.png — near: "TrueProfit now detects the supported platforms you use but haven't connected:  payment gateways, shipping, POD"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2405580597/8d975a49351315c2394821c39414/image.png — near: ": A banner will appear on your Dashboard. Click it, follow the prompt on Shopify, and you're all set. The bann"

#### Switch between multiple stores
Source: https://helpdesk.trueprofit.io/en/articles/11330347-switch-between-multiple-stores

- [APP] https://trueprofit-d5581ecd89bf.intercom-attachments-1.com/i/o/k3mvy0bn/1515444094/97a6c171abe2fbd620ecdf18f698/image_johut8.png — near: "To switch between different stores, click on the store switching dropdown on the top."
- [APP] https://trueprofit-d5581ecd89bf.intercom-attachments-1.com/i/o/k3mvy0bn/1515444100/a59a583f83723f424636009bf747/screenshot-2024-03-14-135918_37arte.png — near: "Here you can find all the stores you added to your TrueProfit account and stores you are invited to. Plus, you"

#### Add/Link a store to your TrueProfit account
Source: https://helpdesk.trueprofit.io/en/articles/11330354-add-link-a-store-to-your-trueprofit-account

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515448911/07927c8a9209733341048ff459c2/image_1xr5kkd.png — near: "To add more stores to your current account, start by clicking on the multistore dropdown and click Add store"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598033181/6fb1f27a4b22fd2132d5d1d0f47a/image.png — near: "Click on the Person icon in the top right corner, then select Manage stores & Members."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515448913/499a61e8acde7b942d07b1d17fb6/remove-store_9s6ga0.gif — near: "On this page, you'll find a list of stores currently linked to your account. To remove a store, click on the t"

#### Dashboard Introduction
Source: https://helpdesk.trueprofit.io/en/articles/11330378-dashboard-introduction

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461773/6de2345e2531312733943f7c7261/dashboard_1nztuop.gif — near: "Click on the three dots button on the top right side of the Dashboard, here you can select to Filter by Paymen"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461760/c6bbcc02022b6b5ed91d3617f6d8/image_kks4s7.png — near: "To effectively analyze trends and gain meaningful insights, please ensure you select a minimum period of two d"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461758/4d493985514b582c43caf2b26ac0/image_1luctlh.png — near: "By analyzing this breakdown, you can pinpoint significant areas of spending, helping to guide budget optimizat"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461765/a0f2ba3dbacc077100ed07fbc6c1/image_hhii0j.png — near: "to view your data in this section."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461772/bae61590dc2281b076b02d6f227b/image_1tlgq0r.png — near: "The Order Summary compiles essential metrics, providing a concise overview of order performance to aid in stra"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515461768/bc57b5af0d7ac395d1ca7b1ceddd/image_xxdzuj.png — near: "Why is my data not updating"

#### Change currency and language in the app
Source: https://helpdesk.trueprofit.io/en/articles/11330404-change-currency-and-language-in-the-app

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598038831/6ffa0b1bbc3912b04ef914d6afeb/image.png — near: "How to change the in-app currency for your store"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598039479/6237f883ebfe55bc78efa5574b4b/image.png — near: "Here you can find the Display currency selection for your store. Click on the dropdown button and choose your "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515467534/543adc35f107f04bc79b3893607b/image_167w934.png — near: "To change the displaying language in the TrueProfit app, make sure you've created a TrueProfit account. The ap"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2598041444/36158b97d7ad70c7082ddb0c12f7/image.png — near: "Once done, click on your Account information in the top right corner."

#### Set a default date range for all reports
Source: https://helpdesk.trueprofit.io/en/articles/11330415-set-a-default-date-range-for-all-reports

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2592505580/f9a24f21800a40e1cc204e244bd6/image.png — near: "When using the Dashboard, Product Analytics, Marketing Attribution, and Orders Report, TrueProfit has a date r"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2592510358/1c7fa5918cfc09235ec4d6547143/image.png — near: "1. In the left-side menu, click on Calculation Preference in the Store Settings section."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2592546338/04df0dce05e5164b8dd2bc472357/image.png — near: "2. At the bottom of the page, you can find the Default date range section"

#### Why good website speed is vital for E-commerce success
Source: https://helpdesk.trueprofit.io/en/articles/11330425-why-good-website-speed-is-vital-for-e-commerce-success

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515476796/37482e4d2ed13267d9783b974950/image-1_9g19l9.png — near: "When it comes to online shopping, speed dictates success. A delay of even a few seconds can severely impact yo"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515476800/8cd12ad7547142c62123835fb100/image-2_nu7c9c.png — near: "After all we’ve been talking about, you probably realized that site speed optimization is a comprehensive task"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515476799/313d2bec6ad2c0bf98dda3e3a858/image-3_xpiamg.png — near: "Including all the above services, they offer a complete package optimization at $150 per optimization - arguab"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515476798/35f7f2ed8b6ae68cbf793d6653b6/gif_1ljudq8.gif — near: "Many of our customers have seen remarkable improvements, and their testimonials speak volumes about the effica"

#### Onboarding your TikTok Shop on TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11330575-onboarding-your-tiktok-shop-on-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515546950/e04ed0a45447108dd6d0df35c04b/image_19n3wl8.png — near: "2. Once you've created a TrueProfit account, the next step is to connect your TikTok Shop:"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515546949/1f7a3048e648f0e4dc1ec985cde9/image_1aay8l.png — near: "to start exploring the TrueProfit app."

#### Using the TrueProfit Mobile App
Source: https://helpdesk.trueprofit.io/en/articles/11330581-using-the-trueprofit-mobile-app

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549955/1b226314bf06d35edb7dec857747/image_nh27cq.png — near: "on the web app, you can then to sign in with your account or scan the QR code from the web app.​"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549945/8a570f32be72eab137341b2df927/image_1s61h1x.png — near: "Arrange or pin/unpin metrics to reflect your business priorities and closely monitor essential data at a glanc"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549947/f63a1d5d75b22ccaf6204ef855fe/image_5o9nk5.png — near: "Swipe left or right to smoothly switch between different metric groups, including Ad Spend Summary, Order Summ"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549956/156cc6cb352c4e1ff2a9cac92273/image_1gv083d.png — near: "Visually compare key performance metrics over your selected date range, including Net Profit, Net Profit Margi"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549954/e5f9844e7c9ed8eb5a289f9a3489/image_1jm61zx.png — near: "Helps you make informed cost-saving decisions for improving profit margins."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549953/3b8a48127c7990a8fe30694b2fa2/image_kiikop.png — near: "To view a detailed breakdown of a specific channel in the chart, please double tap on the column of that chann"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515549957/018fa3b8add4187447b56fd0f30e/image_1h8fux9.png — near: "To view a detailed breakdown of a specific date in the chart, double tap on the column of that day. To unselec"

#### Setting up Email Reports for TikTok Shops
Source: https://helpdesk.trueprofit.io/en/articles/11330585-setting-up-email-reports-for-tiktok-shops

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515551101/cdcc752c76571ee5388c29ddb207/image_brhsmk.png — near: "TrueProfit will send a confirmation email to this address, make sure you confirm your email to start receiving"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515551103/d987f2a6853a8f51d58bdb0dbe6b/image_qmexmz.png — near: "section where you can choose the frequency to receive the email reports. This is also the time range of the da"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515551102/8072938baeade8af74763fb984b7/screen-shot-2020-09-03-at-1747_qf1aol.png — near: "Once done, you will receive a report email similar to this:"

#### How to set up Cost of Goods for TikTok Shops
Source: https://helpdesk.trueprofit.io/en/articles/11330590-how-to-set-up-cost-of-goods-for-tiktok-shops

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554287/f4ae8aae0199bff3b2ba46f314d4/image_1uk5tmg.png — near: "2. The setting page will look similar to this:"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554286/1b22e2fe3779188e20c133bf2085/image_1s1qk0c.png — near: "level. To start editing the COGS value of a variant, click anywhere on the product's row or click on the dropd"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554294/4475e21e5254c98f655644815956/image_dh6axb.png — near: "Cost of Goods Sold column"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554291/7b9988912f97eb5c45fd5c3427fd/image_11fqx26.png — near: "5. When you are done editing your COGS, make sure to apply this cost to your orders in the past. To do this, c"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554288/4c470743d2ec1484b3554238e75e/image_go6p7g.png — near: "button to start applying the COGS to your past orders and view it in the Orders Report."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515554285/39ae7767772c737504ec42ffaa58/image_1i8h3f2.png — near: "If the products you are selling have the same COGS value across all variants, you can toggle on the product le"

#### Setting up Affiliate Commission rate
Source: https://helpdesk.trueprofit.io/en/articles/11330600-setting-up-affiliate-commission-rate

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515557781/af3a2031222ff47f4978507a07b2/image_1tyu6ms.png — near: "in the Cost Settings section"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515557780/072097e29ae21b1c17fe7d32e8c3/image_6mkl29.png — near: "to get started."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515557788/5a932965c6ae4c132a989ef25060/image_13ym6kl.png — near: "in real-time."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515557784/e3eeecdcd6808d63eb70e4e07ea0/image_1o56e7k.png — near: "your change."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515557791/e18d7be578a5adef160a4aeffc75/image_irize5.png — near: "and apply it to cost calculations in the Dashboard."

#### Install the TrueProfit mobile app
Source: https://helpdesk.trueprofit.io/en/articles/11330606-install-the-trueprofit-mobile-app

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563209/c2355bbc076b07d0efcabe4ed0ff/image_niyhkt.png — near: "The QR code on the TrueProfit website is a quick way to sign in and install the app on the mobile app. Make su"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563208/7db06a90fd2e2961112419a2bbdb/image_ktvygj.png — near: "The QR code on the TrueProfit website is a quick way to sign in and install the app on the mobile app. Make su"

#### Set up Custom Cost for TikTok Shops
Source: https://helpdesk.trueprofit.io/en/articles/11330610-set-up-custom-cost-for-tiktok-shops

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563429/1f3da4e4da1189f790f0677c1368/image_qrnx1j.png — near: "Custom Costs is a feature for you to add more costs to TrueProfit manually. As a seller on Shopify, there migh"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563423/35e146410a114c1a53d86b020ebf/image_1w4jycs.png — near: "to add a new fixed custom cost"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563430/2c953f8ca35c7852cf6d30408f2f/image_12t2l1m.png — near: "to save your new Fixed Cost"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563433/86f16dcd10fa77c64f192a9a0b0c/image_u978ut.png — near: "Variable Costs"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515563443/ac098c90694e4ebcf6a44002aff7/image_1a73b1m.png — near: "For example, if you outsource your TikTok Ad Campaign to an agency, and they charge you 10 percent of TikTok A"

#### Set up TrueProfit widget for mobile
Source: https://helpdesk.trueprofit.io/en/articles/11330619-set-up-trueprofit-widget-for-mobile

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566793/ef75b338a41c02195e0b119b304b/image_1gjw7dr.png — near: "A quick way to install the TrueProfit mobile app is to click on the Get mobile app button then scan the QR cod"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566803/2c0cbc4e34a4196d2b08b5d9ed97/image_14rsfs6.png — near: "Step 3: Search for TrueProfit, then click Add Widget"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566798/f9a8b465b8daf75a9239754427d7/image_13zugl7.png — near: "Step 4: Tap on the new TrueProfit widget to choose a store and select the metrics you want to add to the widge"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566802/4c755f0eafc0872905e907839150/iphone-home-screen-widgets-med_gnq1be.png — near: "Step 5: Drag the widget to anywhere you want and you are all set! Add more widgets if you have multiple stores"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566807/e2443abbd23fdbf90541122dba41/image_k57wvu.png — near: "Step 3: Search for TrueProfit, then click Add"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566804/37844e42e2d577e6bcc211ccb3ce/image_1ie2t5d.png — near: "Step 4: In the customize screen, select a store and the metrics you want to add to the widget, tap Done to sav"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515566800/8e88ba5becfd5941bea5c3288efa/handheld_1x021uy.png — near: "Step 5: Drag the widget to anywhere you want and you are all set! Add more widgets if you have multiple stores"

#### How to connect and sync Ad Spend from TikTok
Source: https://helpdesk.trueprofit.io/en/articles/11330638-how-to-connect-and-sync-ad-spend-from-tiktok

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515575304/08c22272c70d4f10f3a7df255553/image_tyzhpl.png — near: "TikTok Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515575298/4ccf75e330b82e43cbe692d7411b/image_hu09p1.png — near: "Add account"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515575302/b1a7a4eacb863a713dcaf8f85695/image_1tabnk8.png — near: ". After it is enabled, the app will automatically sync your ad spend every 15 minutes."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515575303/5fe31238a19004e9eb2fd16f04f0/image_w4wjsf.png — near: "You can go to the Dashboard to view the TikTok Ad Spend metric conveniently along with other financial metrics"

#### Can I add multiple shops to my account?
Source: https://helpdesk.trueprofit.io/en/articles/11330639-can-i-add-multiple-shops-to-my-account

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515578502/4afafda73952614c60ebe6cd5d5c/image_1mhvhq0.png — near: "1. In the top bar, click on the switch shops menu"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515578504/05e6e62e525b34526b1a9a4aa817/image_flm73a.png — near: "2. Here, you will find a list of your added shops and the button to add a new TikTok shop"

#### Integrate Print-On-Demand platforms with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11331248-integrate-print-on-demand-platforms-with-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515826041/32b643693fad71e4ca5937b6aa57/1_+Navig.png — near: "Print-on-demand Services"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1515821826/595291426d97fc4179ef18ffe3f0/2_+Fill+API.png — near: "In the pop-up window, add the required information (like your API key and email)."

#### Connect with Printify print-on-demand
Source: https://helpdesk.trueprofit.io/en/articles/11363299-connect-with-printify-print-on-demand

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526921144/c602ca56a387d05f878be1e08ba0/1_printify.png — near: "to begin linking your Printify account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1548334898/ea7ca799ada2549b3fe0f1f18a22/Printify.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1548337787/cbd803a94fb57989494150d306eb/2_+Store+ID.png — near: ", in your browser’s address bar, you’ll see a URL—copy the Store ID number from that URL. Then, paste this Sto"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526942554/69985feb86a75110f3aa056fbf84/2_+Generate.png — near: ". Here, you’ll find your API Tokens."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526946631/4822bf6402242f599609447c5104/2_+Generate+token.png — near: "Generate token"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526955785/be85593a1cd3cfff3c57476bd4d9/4_+copy+clipboard.png — near: "4. Click "Copy to clipboard" your API key to use in the TrueProfit integration popup."

#### Connect with Printful print-on-demand
Source: https://helpdesk.trueprofit.io/en/articles/11363314-connect-with-printful-print-on-demand

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1527011658/85edae95c76162f13d273a2e6a49/1_printful.png — near: "to begin linking your Printful account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1553106776/573312dc3181939cbce82d85383a/1_printful.png — near: "to connect with Printful"

#### Connect with Gelato print-on-demand
Source: https://helpdesk.trueprofit.io/en/articles/11389433-connect-with-gelato-print-on-demand

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526903034/d53fa75aedcd2b515592a70f59ca/1_Gelato.png — near: "to begin linking your Gelato account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1548339089/40fc32a60c9bb6d1d649e822a2ef/Gelato.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1548345569/22189394c1aa0c82559053f81971/select+store.png — near: "Go to “Stores”, and select the connected store that you want to get order data from."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1548345867/d6ebf9a8f5faded830b37312d365/2_+gelato+Store+ID.png — near: "In your browser’s address bar, you’ll see a URL—copy the Store ID number from that URL. Then, paste this Store"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526877860/e4e5478372c5299dbd439cd23e1b/1_+Navigate.png — near: "API Key"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526885434/0575f2a4df31c2163bd491c3a369/2_+add+AIP+key.png — near: "Add API key"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526889731/1185259ac1c8b67ae189020e1ce1/3_+create+AIP+key.png — near: "Create Key"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1526892781/d524db3359a967a2acd13bd54fee/4_+copy+key.png — near: ", to paste it in TrueProfit."

#### Connect with Gooten Print-on-Demand
Source: https://helpdesk.trueprofit.io/en/articles/11639815-connect-with-gooten-print-on-demand

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583513763/ba5cb127b55df4b16e27c55a8b83/1_Gooten+finding.png — near: "to begin linking your Gooten account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583514229/ea418f63ffdff5bc7520236aaef8/2_+connect+Gooten.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583514842/c39045a3134ea591d7d8ab61b65d/3_+Key+gooten.png — near: "Go to “Settings”, and click the tab "API", you will see the API key. Copy them and paste them into the integra"

#### Connect with Teelaunch Print-on-Demand
Source: https://helpdesk.trueprofit.io/en/articles/11640070-connect-with-teelaunch-print-on-demand

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583532259/96cfed90bed463df13c457abf5a6/1_Teelaunch+finding.png — near: "to begin linking your Teelaunch account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583532436/d83f320e4343fd36d568fdc79898/2_+connect+Teelaunch.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583532625/ba09ff781ab3c49765112f625e6e/3_+copy+key+Teelaunch.png — near: "Go to "Account" > “Settings”, scroll down to "developer settings", and get API key. Copy it and paste it into "

#### Connect with Eprolo dropshipping platform
Source: https://helpdesk.trueprofit.io/en/articles/11640102-connect-with-eprolo-dropshipping-platform

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583600899/c077c933bf58358b19ebea842b98/1_Eprolo+finding.png — near: "to begin linking your Eprolo account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583601340/3cc99b850eeb02151f824e29f14d/2_+connect+Eprolo.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583601984/7de76efe2a9184bb851e02a63dd6/3_+ask+chatbox.png — near: "From the dashboard, click chatbox on the right page to request the API key. The Eprolo team will send you the "
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583605906/d3ec450d1526beed4adebe4680e9/4_+email.png — near: "Copy them and paste them into the integration pop-up on TrueProfit."

#### Connect with Zopi dropshipping platform
Source: https://helpdesk.trueprofit.io/en/articles/11640292-connect-with-zopi-dropshipping-platform

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583637744/e4142b0f53257126eebac58e90d3/1_Zopi+finding.png — near: "to begin linking your Zopi account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1583626904/f8e7139715a448d12bbac53b17df/2_+connect+Eprolo.png — near: "button next to Zopi on the Integrations page."

#### Connect AdRoll Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11847898-connect-adroll-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1637621091/827e5cec67cd280d9e09b28e9e91/1_+Navigate.png — near: "Step 1: In the left side menu, go to Integrations > In the search bar of Integrations, type AdRoll to search"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1637623350/d7527eb79c984b541864fdc644a4/2_+Sign+in.png — near: "Step 3: Sign in to AdRoll"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1637621900/3c876be8b656f6e3e00cedafd690/3_+Authorize.png — near: "Step 4: Click "Authorize" to allow TrueProfit to access AdRoll"

#### Connect AppLovin with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11848154-connect-applovin-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1637691505/1b91559aa7caac8f01f4c704514e/1_+Navigate.png — near: "Step 1: In the left side menu, go to Integrations > In the search bar of Integrations, type AppLovin to search"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1637691693/d64ed9e17611c17b5fa850907ad3/2_+connect.png — near: "Step 2: Click on Connect for AppLovin."

#### Connect Yotpo with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11966823-connect-yotpo-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1659856109/50d9be94d4ca0341418824cd2728/1_+Navigate.png — near: "Yotpo"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1659856253/08d1501ec9cf5ca16a3e70926f64/2_connect.png — near: "and sign in to your Yotpo account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1659856389/e761384d410fa547591efbaedd8e/4_+account+settings.png — near: "and retrieve it from the email sent by Yotpo."

#### Connect autoDS with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/11982788-connect-autods-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1743497647/cc1cfe60d842a61afed168ac898f/1_+Navigate.png — near: "to begin linking your autoDS account."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1708536746/45c074c58d06b4fce3073f3821d0/1_+Navigate.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1708571683/6c876d64b240ee8e775267618494/2_+store+ID.png — near: "Note: Make sure the AutoDS store matches your TrueProfit store"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1743733877/3c0b414a51f939f66de16f019734/change+source.png — near: "Check the source in Product COGS to make sure it’s correct. Some variants may have the wrong source and need t"

#### Set up custom costs
Source: https://helpdesk.trueprofit.io/en/articles/12289182-set-up-custom-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1727853862/c033a42e408593cf18127b599f60/1_+navigate.png — near: "Add cost"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1794532210/e202f1608684bd5e5088cce39da7/o%CC%82nging.png — near: "Recurring cost or ongoing cost: Select only the Start date. End date is no needed. Click the x to remove end d"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1806158804/71aa75eadfcb66464c1a97f1b60b/image.png — near: "There are 2 common categories: Marketing and Taxes Paid"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1729891440/51fe9f31f965fb125825be954510/2_+Fixed+cost.png — near: "Step 8: Click"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1729892109/85b8dc0f34d9c4e7abf8b1f2c16d/3_+Variable+cost.png — near: "Variable cost"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1806159669/71e733c34558e6b9691fd4aa7ea4/image.png — near: "There are 2 common categories: Marketing and Taxes Paid"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1727854717/907508cb648cef1ba5faccfc5977/4_+manage+cate.png — near: "Custom Cost Categories help you manage your custom costs easier. A Custom Cost report based on categories is a"

#### Where is Ad destination URL in Ad channels?
Source: https://helpdesk.trueprofit.io/en/articles/12320111-where-is-ad-destination-url-in-ad-channels

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1821851771/46a63d41f6ebd1461f785d200cbf/1_+click+to+edit.png — near: "Edit"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1821851879/d9618ffcbea75d54c384d3a9a063/2_+add+paste+here.png — near: "4. Paste the URL parameter in the Final URL"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2098861208/9b0dead1de983d9e3eca976363c0/GG1.png — near: ". Both locations will function correctly."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1848209161/82f359b0cd7cc71a5151d4309d61/note.png — near: "To find a Destination Website URL on Facebook, your campaign must use the Lead or Traffic objective. Other cam"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1830373622/0078b57c4da1efdd8bea96e8de79/Fb+2.png — near: "From your Ad Manager Facebook, go to your campaign"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1830373934/0f1817bd08c04d00a979c1ab0855/Fb+3.png — near: "2. Click "edit" your campaign"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1830374702/ba3a0334a92c220a0433f9ed6d09/Fb+4.png — near: "4. Scroll down to the destination section > Find Website URL"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1733634725/d6b55ee07c09049f96b968018ae6/Meta.png — near: "5. Paste the URL parameter in the Website URL"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1733635062/b13e8c9af3684ff2f0b554c12902/Tiktok.png — near: "Go to edit your ad to find website URL"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1733688711/885ea14848457ddb06929bf460ee/Pinterest.png — near: "Go to find destination URL in your ad details"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1733652044/3ac178ad90e34cb1019ddba28e4b/Snapchat.png — near: "V. Snapchat"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1733693399/24f38f3cae60289a71a954785642/Microsoft.png — near: "Go to find "Final URL""

#### Version 2: Set up cost of goods sold and bundle costs (newest)
Source: https://helpdesk.trueprofit.io/en/articles/12381267-version-2-set-up-cost-of-goods-sold-and-bundle-costs-newest

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453552/d077e37d2b38cf1df95ca48dbbba/main%2Bview.png — near: "to update your reports."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453550/182075148fdb8316cfd421a176d5/1_%2Breview%2Band%2Bupdate%2Bcosts.png — near: "to manually edit cost per unit and keep your report accurate."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453553/fcf0a80f131378595880491f021b/2_%2Benter%2Bcost.png — near: "to apply changes."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453549/4e124812b029a71a02ed5761d52e/history.png — near: "Understanding time and cost changed"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2657062499/de4585d65c37cbfd6ecd55d14c50/image.png — near: "When you save a change that requires recalculation, a banner appears letting you choose which products and dat"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1909453551/361e910becee1c6ddbde9cce81ee/6_-2Border-2Breport.png — near: "Even if you later disconnect the integration and manually change costs in the COGS page, those changes still w"

#### Beta: Build a URL Parameter in TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/12568948-beta-build-a-url-parameter-in-trueprofit

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1775092047/3b72d8bf39f589b8fbbd1a8eb3b5/step1.png — near: "From the Marketing Attribution page, click "Build a URL Parameter" in step 3."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1775090897/3de9a97e6645d67d3ae18e19c441/build.png — near: "where the Ad destination URL in Ad channels is"

#### Set up custom metrics
Source: https://helpdesk.trueprofit.io/en/articles/12856190-set-up-custom-metrics

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2527563368/83e81ef0bfce1731571341622577/1_+start.png — near: "A modal (popup) will open that allows you to create your custom metric."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1836117146/c389e89d167586ab43801967981e/2_+fill.png — near: "Important: The name must be different from any built-in metric name such as Net Profit, Revenue, etc."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1836117378/1070efa45fec1ef15f5f976b36ce/3_+a+co%CC%80ng.png — near: "Net Sales = Total Sales - Return - Taxes"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1836117534/bf40b581ff921a288de1a0970f6f/4_+delete.png — near: "to remove it."

#### Connect Stripe payment provider
Source: https://helpdesk.trueprofit.io/en/articles/12917436-connect-stripe-payment-provider

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1858035025/f234d1d832ec861bad94b31bee1f/connect.png — near: "to complete the setup."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1858000335/b5df9de5b62ba774eb71d4a28ec9/Dev.png — near: "Once you’re logged in, click "Developer" in the bottom left of the page > "API keys""
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1860024748/924aebf5843932c55799a424537a/create.png — near: "section."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1860025369/cb37cd9dd7dd0ea14f32b8316c23/select.png — near: ""Continue""
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1860026410/f30ad681d94c7d07ebddd2232957/Name.png — near: ""Create restricted keys""
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1860028671/b6915539b34f31bec20bd0c6f530/copy+to+clipboard.png — near: "immediately once the restricted key is generated, because it’s shown only once after it’s created. Later, you "
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1858026084/ac5c5568baa3441cae0966e44b91/order+report.png — near: "After a few minutes, you can check your synced Stripe transactions in the TrueProfit Orders Report. When order"

#### Add tracking parameters for Google ads using Chrome extension
Source: https://helpdesk.trueprofit.io/en/articles/12941816-add-tracking-parameters-for-google-ads-using-chrome-extension

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1850409361/550d34a8f9367ded685e6db0e440/1_%2Bclick%2Bto%2Bedit.png — near: ", not the campaign or ad group level. The parameter must be added to each ad."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1850420613/6545906e9eef547f5d2a535f674b/6_%2Bextension%2Bparmameter.png — near: "guide instead"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1850441793/5d608625659b09a6ab9a619ec766/extenstiom.png — near: "at the beginning of the parameter. Google Ads automatically handles this."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1850446956/43b1f08c6989a411115a1ce64308/GG.png — near: "Make sure this URL correctly matches the page your ad is promoting (e.g. product page, collection page, or hom"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2098927377/472bb28f15b1ddfd38737bff03b6/GG.png — near: "https://apps.shopify.com/trueprofit?tp_source=facebook&tp_adid={{ad.id}}&tp_productid=8168837710012"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2098912308/a07af92bcb9a99d5808b1b317fec/GG1.png — near: "https://apps.shopify.com/trueprofit?tp_source=facebook&tp_adid={{ad.id}}&tp_productid=8168837710012"

#### Action needed: COGS page upgrade & migration notice
Source: https://helpdesk.trueprofit.io/en/articles/13234734-action-needed-cogs-page-upgrade-migration-notice

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1903201548/1c664b8050dc77e6bb495449887a/hidden+icon.png — near: "The Quantity Break settings were hidden behind small icon buttons, so many users didn’t notice them."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1902597397/1a9f5817fe204c3e3d35104a42a5/image.png — near: ", not cost per unit. So the format often didn’t match what TrueProfit required."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1902597859/bee2b6859b5b259b2017a91d025e/main%2Bview.png — near: "How Order COGS is calculated when Bundle Cost is set"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1903202362/acad2359ccb44afc7eda7a83d73d/HISTORICAL.png — near: "of users used it."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1906275300/16009aa7465a7e60a3a067a777f5/history%2Btime.png — near: "on the COGS page, TrueProfit will auto-recalculate—and those changes can affect past orders."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1906274363/7246f3a1152b6b6ed059e7f94e6f/Export+order+report.png — near: "This preserves COGS values for all orders created up to the day you complete the import, so past order COGS st"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1906248791/a44a8c907be640692a8fe4802188/Export+COGS.png — near: "2. Export your current COGS data to your computer so you can compare it later with the new COGS version."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1903210432/6ef7592b82dcdee6d779730fc444/handling+fee.png — near: "Handling Fee is removed to keep COGS cleaner and easier to understand."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1903445042/76e5c7c8c411a5082aaecd620059/custom+cost.png — near: "How to add custom cost"

#### Manage Marketing Channel Accounts and Set Up Ad Spend Sync by Campaign Filter
Source: https://helpdesk.trueprofit.io/en/articles/13349042-manage-marketing-channel-accounts-and-set-up-ad-spend-sync-by-campaign-filter

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932773508/db06f75f95ff29b5f55cd718351b/account.png — near: "to choose the ad accounts you wish to sync. You can add more later."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932772963/fb60c918c117eb614d351b9bcb16/add%2Baccount.png — near: "to begin syncing data from Facebook."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932891402/6ee8b118db3477645fdb527bfcc0/stop+syncing.png — near: "Stop Syncing"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932895511/004ca50e7fec50666f139dc1ddc5/set.png — near: "Set Campaign Name Filters"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932900799/2b1b7e2fd36bf3edad2df819c49d/filter.png — near: "These filters apply automatically to both current and future campaigns."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/1932904065/cea150d8dd2b7eff307a38f42af0/showw.png — near: "sign indicates exclusion."

#### Version 2 (beta): Set up Shipping Costs in the main view
Source: https://helpdesk.trueprofit.io/en/articles/13856923-version-2-beta-set-up-shipping-costs-in-the-main-view

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118924598/56f6c740b8e108b309973ed492d8/gif+mini+onboarding.gif — near: "Mini Onboarding"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118694685/39231634e42fd6af4169941cd139/Group%2B1171278313.png — near: "hover on the value → click → edit"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118694680/2757b6ac99605f584ce3118455aa/le.png — near: "(column header) and edit the shipping zone"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2110420279/89fb292937ffbab2943988815b07/image.png — near: "And you can edit the value shipping cost of each product and variant, just hover and click to start editing"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2118759314/e62222eba99c1dc76e306f490ed1/Screen%2BRecording%2B2026-02-27%2Bat%2B14_52_06.gif — near: "to view more columns."

#### Extract Bill with AI: Automate Your Custom Costs
Source: https://helpdesk.trueprofit.io/en/articles/13904711-extract-bill-with-ai-automate-your-custom-costs

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122201193/2490a372b3596ed61394976a8105/gif-extract-cost-1.gif — near: "Add to Custom Costs"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122137887/7d6658fc8102a96727c11579c584/gif-extract-bill-2.gif — near: "Before finalizing the upload, you can customize the following fields:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122184865/21251626f3d60892561603db6673/image.png — near: "Choose if the cost should repeat (Daily, Weekly, Monthly, or No Repeat)."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2122013267/900e9d71733403c60f801d10e80c/image.png — near: "in a new tab to check for overlaps. If a fee is already recorded, simply delete that row from the AI extractio"

#### TrueProfit MCP: Connect TrueProfit to ChatGPT, Claude, and OpenClaw (Clawdbot)
Source: https://helpdesk.trueprofit.io/en/articles/14086381-trueprofit-mcp-connect-trueprofit-to-chatgpt-claude-and-openclaw-clawdbot

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2532197097/2856baa9621f7a524dc9c28e8958/chatgpt.png — near: "Connect"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2412489578/d4befb00704cf5c461862de65322/chatgptttt.gif — near: "4. Once this is done,  just click "Start chat" to ask anything about your store. ChatGPT can use your TrueProf"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2412516006/ec531be4ac0666ebf06ffa4e9bd5/toggle.png — near: "This allows ChatGPT to use relevant memories and previous conversations when working with TrueProfit, so respo"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608430972/86f00a0313d865b2908ffc445586/CLAUDE.gif — near: "6. Click "Connect to Claude""
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2198592639/bbb842105fb40b2654c40281b4e0/0318.gif — near: "Once this is done, Claude can use your TrueProfit data."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2198592625/5ffdbcca7facfeba325a148f5298/allow.png — near: "This helps avoid repeated permission pop-ups while you use TrueProfit with Claude."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2622989125/b120b1847021287ead20019163b1/Claw1.jpg — near: "3. Search "Trueprofit". Under the ClawHub section, click the Search ClawHub skills... field and type "Trueprof"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2622992319/551cf465a8b1233b5be2d0b025e1/Claw2.jpg — near: "4. Select TrueProfit from the search results and click Install."

#### Connect Google Ads with TrueProfit
Source: https://helpdesk.trueprofit.io/en/articles/14631734-connect-google-ads-with-trueprofit

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275817296/de6880d0831955ff51a7e6ae14db/GG.png — near: "Google Ads"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275800970/6f5b00f425bab2592bcd28f88a67/image.png — near: "to continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2637284361/67aa872997156969ecc7ff6624c0/Gemini_Generated_Image_arlxqwarlxqwarlx.png — near: "Please make sure every checkbox is ticked before clicking Continue."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275817992/b0b79a2d15d62ecea43978507625/stop+syncing+gg.jpg — near: "next to it.​"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2275840278/6659f70fb445654295507e6bf2ff/GG+select.jpg — near: "and choose the ad accounts you want to sync with TrueProfit. You can always add more ad accounts later."

#### Add tracking parameters for TikTok ads using Chrome extension
Source: https://helpdesk.trueprofit.io/en/articles/15431931-add-tracking-parameters-for-tiktok-ads-using-chrome-extension

- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2464904645/51adb3ce193a60c2966664abdd85/tt.png — near: ", not the campaign or ad group level. The parameter must be added to each ad."
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2464859360/9e96aeff118f9c1c5be67dbe4dcc/6_-2Bextension-2Bparmameter.png — near: "guide instead"
- [3P?] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2464918664/15cc7c46bd90821fb1d1f8a84bb1/image.png — near: "https://apps.shopify.com/trueprofit?tp_source=facebook&tp_adid={{ad.id}}&tp_productid=8168837710012"

#### FAQ: TrueProfit billing & subscription: how it works
Source: https://helpdesk.trueprofit.io/en/articles/15855069-faq-trueprofit-billing-subscription-how-it-works

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2525438395/614a19ad1998d60be15c3b271b07/shopify+quote.jpg — near: "If you uninstall after the charge has been generated but before the invoice is issued, the charge will still b"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2525456415/c784d71445af47dac7b8b233629d/shopify.jpg — near: "in Troubleshoot pending charges after uninstalling an app"

#### Why is my TrueProfit data not updating?
Source: https://helpdesk.trueprofit.io/en/articles/15919801-why-is-my-trueprofit-data-not-updating

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2537827283/ae42a942c4ca5cc6a0dd3b12d65f/image.png — near: "If the error persists, go to Settings → Integrations and reconnect your Shopify store."

#### How to recalculate COGS for past orders
Source: https://helpdesk.trueprofit.io/en/articles/16051710-how-to-recalculate-cogs-for-past-orders

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2562926809/833f4ff283ea7ecd882e2afb2887/image.png — near: "button is always available, even when the banner isn't shown."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2629402790/c11018d27b469b52e2a448286613/image.png — near: "Custom date range: updates only orders placed within the date range you choose. Both From and To default to to"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2629404878/8d916bf432b3e750e4e80ecafc12/image.png — near: "to review your updated COGS and profit."

#### How to set up Handling Fees
Source: https://helpdesk.trueprofit.io/en/articles/16065248-how-to-set-up-handling-fees

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582314348/237395277ed0e3214d625e9d0b23/image.png — near: "The first time you open the Handling Fees page, you'll see a short intro: "Set up Handling Fees for accurate p"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582315209/2ef305df19e56b2e7b3531c91c4b/image.png — near: "Next, you'll be asked: "How does your supplier charge you for handling fees?" This is the one question that de"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582328627/83a4660a68fd40e2274157a52c82/image.png — near: "• Choose how it applies: per order (default, charged once no matter how many items) or per item in an order (c"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582329215/d7116f79ab7df71651720e3efabc/image.png — near: "As you type or change the option, an example right below updates instantly to show exactly how a 3-item order "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582336875/acd3655d662ed657cfa6446623d0/image.png — near: "• If a product's variants have different fees, the product row shows a range, like $0.20 to $0.80, instead of "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2582356871/48bd8cb72a9dc56d59f78d66ab3c/handle.jpg — near: "• Use "Export" to download your current fees as a CSV file, and "Import" to update many products at once. The "

#### How Chargeback Loss and Chargeback Fee Work (BETA)
Source: https://helpdesk.trueprofit.io/en/articles/16293283-how-chargeback-loss-and-chargeback-fee-work-beta

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2612427536/639f2712e53ae504cbbf82d29bb9/add++chargeback.jpg — near: "Go to Dashboard > click "Add Metrics" (below your pinned metrics) > search "chargeback" > pin both Chargeback "
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2597860394/82ecc1de64e0ad2d0505f7a50b4c/image.png — near: "If you haven't granted access yet, you'll see a banner asking you to connect. Click it and approve the request"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2612412405/5117aaa72fe5c3454ca1c1192f20/image.png — near: "Both Chargeback Loss and Chargeback Fee are deducted directly from Net Profit:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2612414378/b42c3920d52df8f963cb7b262ab5/image.png — near: "Go to Calculation Preferences → Chargeback Loss and Fee: Resolution date or Order date to control when these t"

#### Troubleshooting MCP connection
Source: https://helpdesk.trueprofit.io/en/articles/16390840-troubleshooting-mcp-connection

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2629454784/b151e85dc32741826e5c22caeec3/Claude%2Bissue.png — near: "If you see "This connector has no tools available," click ⋮ next to Disconnect, then select "Refresh tools lis"

#### Version 2 (beta): How to set up Shipping Cost Settings
Source: https://helpdesk.trueprofit.io/en/articles/16412210-version-2-beta-how-to-set-up-shipping-cost-settings

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608543199/a67d324f13713cb7d3880b6f285c/image.png — near: "to understand how shipping is calculated."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608543200/26699977facaf5f59fd3853dd8ed/image.png — near: "You will enter the shipping cost by weight range:"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608543201/4a41c0e57ed4ac0c1d92ea0601a6/image.png — near: "to apply them."

#### Version 2 (beta): Create a shipping cost product group
Source: https://helpdesk.trueprofit.io/en/articles/16412281-version-2-beta-create-a-shipping-cost-product-group

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558728/d3ab82575b8e46f52387143836d9/group.png — near: "How to create a product group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558731/05b98b56bf75244d7cf4b42b3d93/image.png — near: "value"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558727/08d1998ea3e604c9826b68fcc304/image.png — near: "Each product is calculated separately based on its quantity, then all shipping costs are added together."
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558741/bccf314116210988b63af2307189/edit.png — near: "Edit product group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558730/bb8a8cd65a0b1f0226d4c3ec3463/image.png — near: "Delete the group"
- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608558729/8e2cffdd26c83212bf38a3cee7fc/image.png — near: "not in this group"

#### Version 2 (beta): Add shipping zone
Source: https://helpdesk.trueprofit.io/en/articles/16412341-version-2-beta-add-shipping-zone

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2608568832/53385ff93c273aca10ab9caadf62/0302.gif — near: "There are 2 ways to add a shipping zone:"

#### Understand Ad Spend allocation and Net Profit per order
Source: https://helpdesk.trueprofit.io/en/articles/16554887-understand-ad-spend-allocation-and-net-profit-per-order

- [APP] https://downloads.intercomcdn.com/i/o/k3mvy0bn/2627373704/b2d1d2b953ca2b320a4cd140db52/image.png — near: "includes the Ad Spend allocated to that order, along with your other costs."

