# Feature Parity Matrix

The **TP** column gives the evidence label for TrueProfit having the feature. The **Ours** column says when we ship it:
**M1** = MVP milestone (Phases 3–6), **M2** = advanced analytics (Phase 7), **M3** = extra
integrations (Phase 8), **Later** = backlog, **No** = deliberately out of scope.
**Edge** marks where we intend to exceed TrueProfit.

| Area | Feature | TP | Ours | Edge / notes |
|---|---|---|---|---|
| Dashboard | Configurable KPI cards + comparison deltas | V/D | M1 | Completeness badge per card |
| Dashboard | Date presets, custom range, store timezone | V/D | M1 | DST-correct boundaries tested |
| Dashboard | Performance chart (rev/cost/profit/margin) | V/D | M1 | Accessible data-table toggle |
| Dashboard | Cost breakdown chart | D | M1 | |
| Dashboard | Ad spend by channel / orders vs ad-spend-per-order | D | M1 | |
| Dashboard | Net profit breakdown / formula tooltips | D | M1 | **Edge:** click-through to full calculation trace |
| Dashboard | Profit variance ("why did profit change") | — | M2 | **Edge** |
| Dashboard | Custom metrics builder | D | Later | |
| Dashboard | Auto-refresh + last-sync timestamps | D | M1 | Per-source freshness |
| Metrics | MER, break-even ROAS, break-even CPA, contribution margin, net sales | NOT FOUND | M1 | **Edge:** first-class metrics |
| Metrics | Consistent definitions across all reports | ✗ (D: inconsistent) | M1 | **Edge:** a single metric registry |
| Shopify | OAuth install, scopes, uninstall handling | V/D | M1 | |
| Shopify | Historical import (bulk) + incremental webhooks + reconciliation | D | M1 | **Edge:** nightly reconciliation report vs Shopify totals |
| Shopify | Refunds, returns, edits (sales agreements) | D | M1 | Event-dated via Shopify sales agreements |
| Shopify | Actual Shopify Payments fees | D | M1 | Fallback to gateway rules |
| Shopify | Chargebacks (Shopify Payments disputes) | D (beta) | M1 | Order-level linkage where Shopify provides it |
| Shopify | Customers | D | M1 (data) / M2 (analytics) | |
| COGS | Variant unit costs synced from Shopify | D/V | M1 | |
| COGS | Manual override, bulk edit, CSV import/export | D (removed on new page) | M1 | **Edge** |
| COGS | **Effective-dated cost history** | Removed (D) | M1 | **Edge:** automatic historical accuracy |
| COGS | Landed cost (product + inbound shipping + handling) | partial (D) | M1 | |
| COGS | Missing-cost detection & warnings | D (notification only) | M1 | **Edge:** never silent; profit marked incomplete |
| COGS | Default/fallback cost (% of price) | V (`cogs_rate` field) / not in docs | M1 | Labelled "estimated" |
| COGS | Bundle tiers | D | Later | |
| COGS | Cost zones by country | D | Later | |
| Shipping | Rule engine (per order / per item / tiers / weight, zones) | D | M1 (per-order, per-item, quantity tiers) → M2 (weight, zones) | |
| Shipping | Shipping charged vs carrier cost separation | D | M1 | |
| Shipping | Carrier/3PL cost sync (ShipStation etc.) | D | Later | |
| Fees | Gateway % + fixed rules, Shopify 3rd-party fee by plan | D/V | M1 | |
| Fees | PayPal / Stripe actual fee sync | D | M3 / Later | |
| Expenses | Custom costs: one-time, daily/weekly/monthly, per order, % based | D | M1 | **Edge:** explicit allocation + audit trail |
| Expenses | Order-tag–targeted costs | D | Later | |
| Expenses | AI bill extraction | D | Later | |
| Ads | Google Ads (OAuth, accounts, daily campaign/ad-group spend) | D | **M1 (Phase 6)** | Needs developer token (external) |
| Ads | Meta Ads | D | M3 | Needs app review (external) |
| Ads | TikTok Ads | D | M3 (if feasible) | |
| Ads | Microsoft, Snapchat, Pinterest, X, Amazon, Taboola, … | D | Later | |
| Ads | Manual ad-spend entry | ✗ (D: not editable) | M1 | **Edge** |
| Ads | Campaign include/exclude filters | D | Later | |
| Attribution | Platform-reported conversions & ROAS | D | M1 | Labelled "platform-reported" |
| Attribution | UTM / landing-site first/last-touch from Shopify order data | D (pixel UTM) | M2 | Labelled "modeled" |
| Attribution | Pixel-based multi-touch | D (Enterprise) | Later | |
| Products | Product/variant profitability table, search, sort, CSV | D | M2 (basic table in M1) | Explicit ad-spend allocation method |
| Products | Funnel metrics (views, ATC) | D (pixel) | Later | |
| Orders | Order list with profit + calculation drawer | D/V | M1 | **Edge:** full trace + audit |
| Orders | Per-order ad-spend allocation | D | M2 | Labelled "allocated (model: …)" |
| P&L | Daily/weekly/monthly P&L, expandable rows | D | M1 (monthly/weekly/daily) | |
| P&L | CSV/XLSX export | D | M1 (CSV), M2 (XLSX) | |
| P&L | PDF export | NOT FOUND | M2 | **Edge** |
| P&L | Multi-store / store comparison | D (All stores) | M2 | |
| Customers | LTV, CAC, LTV:CAC, repurchase rate, cohorts | D/V | M2 | Observed vs estimated labels |
| Multi-store | Store switcher, consolidated view, per-store settings, multi-currency | V/D | M1 (architecture + switcher), M2 (consolidated) | |
| Settings | Calculation policy (tax, refund dating, chargeback dating, COGS return, status filter) | D/V | M1 | **Edge:** versioned policy recorded with results |
| Settings | Team roles (Admin/Editor/Viewer) | D | M2 | Org membership model in M1 schema |
| Settings | Sync centre, error logs | D | M1 | |
| Notifications | Email reports | D | Later | |
| Mobile | Native app, widgets | D | No (responsive web only) | |
| AI | In-app assistant / MCP | V/D | Later | |
| TikTok Shop | Separate product | D | No | |
| Billing | Subscription plans | D | No for now (internal use first) | Revisit if it becomes a public SaaS |
