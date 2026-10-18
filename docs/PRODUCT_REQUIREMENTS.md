# Product Requirements — Shopify Profit Analytics

> Product name: **ProfitLens**.
> Status: Phase 1 deliverable, awaiting approval. Sources: `docs/research/*`.
> Every requirement here is our own design; TrueProfit is a functional reference only.
> No TrueProfit code, branding or assets are reused.

## 1. Product summary

A web application that connects to one or more Shopify stores and advertising accounts and
produces **auditable** profit analytics: revenue → costs → net profit, per store, order, product
and channel. Every figure is traceable to source records and a versioned calculation policy.

**Primary user (v1):** the owner/operator of a small group of Shopify stores (first store: Luraflo,
AUD, Australia/Canberra, Shopify Basic plan, Shopify Payments, Google Ads).
**Later:** agencies and multi-tenant SaaS customers. The architecture is multi-tenant from day one.

### Positioning against the reference product
TrueProfit is feature-rich, but research shows correctness gaps:
- float money values;
- missing COGS silently treated as $0;
- historical COGS dropped from the current COGS page;
- inconsistent metric definitions across reports;
- syncs that run only while a user is logged in;
- no break-even/MER metrics;
- no PDF P&L.

**Our differentiators:**
1. **Correctness:** decimal maths, effective-dated costs, idempotent sync, reconciliation.
2. **Transparency:** a calculation trace for every number; data-completeness warnings.
3. **One metric registry:** a single definition per metric across all screens.
4. **Always-on sync:** server-side schedules, not session-bound.

## 2. Business questions → features (acceptance view)

| # | Question | Answered by | Milestone |
|---|---|---|---|
| 1 | Revenue today? | Dashboard KPI "Revenue" with Today preset (store TZ) | M1 |
| 2 | Ad spend? | KPI "Ad Spend" (Google sync + manual entries), channel breakdown | M1 |
| 3 | Total COGS? | KPI "COGS" + coverage badge | M1 |
| 4 | Shipping & fulfilment costs? | KPI "Shipping Costs" (rule-based or actual) | M1 |
| 5 | Transaction fees? | KPI "Transaction Fees" (actual Shopify Payments fees, else rules) | M1 |
| 6 | Refunds & chargebacks cost? | KPIs "Refunds", "Chargeback Loss/Fees"; P&L rows | M1 |
| 7 | Actual net profit? | KPI "Net Profit" with completeness state | M1 |
| 8 | Net margin? | KPI "Net Margin" | M1 |
| 9 | Most profitable products? | Product profitability table (sort by contribution) | M1 (basic) / M2 |
| 10 | Loss-making products? | Same, filter contribution < 0 | M1 / M2 |
| 11 | Profitable campaigns? | Ads page: spend, platform-reported ROAS vs break-even ROAS; modeled profit labelled | M1 (platform-reported) / M2 (modeled) |
| 12 | Break-even ROAS? | Metric = 1 / contribution margin before ads (definition in FINANCIAL_MODEL) | M1 |
| 13 | This week vs last week? | Comparison selector on every report | M1 |
| 14 | Order profitability? | Orders report + calculation drawer | M1 |
| 15 | Store performance? | Store switcher + consolidated view + store comparison P&L | M1 (switcher) / M2 (consolidated) |

## 3. Scope by milestone

### M1 — MVP (Phases 3–6): "trustworthy numbers for one or more stores"
1. **Accounts & tenancy:** email/password auth (plus Google sign-in later); organizations; memberships;
   all data scoped by `organization_id` → `store_id`.
2. **Shopify connection:** OAuth (authorization code grant, expiring offline tokens with refresh);
   scopes `read_orders, read_all_orders*, read_products, read_inventory, read_customers,
   read_returns, read_shopify_payments_payouts, read_shopify_payments_disputes`
   (*approval-dependent); uninstall plus GDPR compliance webhooks.
3. **Sync:**
   - historical import via Bulk Operations;
   - incremental via webhooks (orders, refunds, transactions, products, inventory items, disputes, app/uninstalled);
   - nightly reconciliation;
   - idempotent upserts keyed by Shopify GID;
   - Sync Center UI with status, last success and errors.
4. **Financial engine (core):**
   - revenue decomposition (gross sales, discounts, returns, shipping charged, tax, tips, gift cards);
   - COGS from effective-dated variant costs;
   - shipping cost rules;
   - transaction fees (actual > rule);
   - chargebacks;
   - custom expenses with allocation;
   - ad spend;
   - versioned FinancialPolicy;
   - decimal arithmetic;
   - per-order calculation trace;
   - completeness flags.
5. **COGS management:** variant table, Shopify unit-cost import, manual override with effective
   date, bulk edit, CSV import/export (preview + validation), missing-cost alerts, fallback rule
   (% of price, labelled *estimated*), landed cost = product + inbound shipping + handling.
6. **Cost settings:**
   - shipping rules: per order, per item, quantity tiers, "use actual if available";
   - gateway fee rules plus the Shopify third-party fee by plan;
   - custom expenses: one-time, daily/weekly/monthly recurring, per order, % of revenue, with categories and an audit trail.
7. **Dashboard:**
   - configurable KPI cards;
   - comparison deltas;
   - performance chart;
   - cost breakdown;
   - ad spend by channel;
   - orders trend;
   - date presets (Today, Yesterday, Last 7/30, This/Last Month, This Year, Custom) in store TZ;
   - last-sync timestamps;
   - auto-refresh.
8. **Orders report** with profit columns and a calculation drawer; **P&L report**
   (daily/weekly/monthly, expandable rows, CSV); basic **product profitability** table.
9. **Google Ads:**
   - OAuth (Google Cloud project with an Explorer/Basic access level; see §6);
   - account selection, including via manager account;
   - daily spend by campaign and ad group (GAQL `cost_micros`, `segments.date` in account TZ);
   - backfill + daily incremental with a re-sync window for late adjustments;
   - FX conversion;
   - manual spend fallback.
10. **Settings:** stores, integrations, policy, currency display, timezone (store-derived, read-only), sync, profile/security.
11. **Demo data adapter:** realistic seeded dataset, flagged `is_demo`, with a visible "Demo data" banner. Never mixed with live stores.

### M2 — Advanced analytics (Phase 7)
- Product analytics: variant-level, product detail view, explicit ad-allocation methods, CSV.
- Ads profitability page: blended (store-level) vs platform-reported vs modeled attribution
  (Shopify UTM/landing-page last-touch), with labels.
- P&L: store comparison, consolidated multi-store (FX-converted), PDF + XLSX export.
- Profit variance bridge; customer analytics (repeat rate, LTV observed, cohorts, CAC blended).
- Team roles (Admin / Editor / Viewer); shipping weight tiers and zones.

### M3 — Additional integrations (Phase 8)
Meta Ads, TikTok Ads (if access is obtained), PayPal/Stripe fee reconciliation, and others by demand.

### Explicitly out of scope (for now)
Native mobile apps, a TikTok Shop product, billing/subscriptions, pixel-based multi-touch attribution,
AI bill extraction, email digests (backlog).

## 4. Key product rules (non-negotiable)

1. Money uses decimal types end-to-end. Rounding happens only at presentation (half-even for
   aggregates, documented per metric).
2. **Unknown ≠ zero.** Any order with a missing cost input is flagged. Aggregates show
   "incomplete: X orders / Y% of revenue lack COGS", and the UI never hides it.
3. Tax collected is not revenue for profit purposes, under the default policy (configurable,
   versioned). Gift-card sales are a liability. Redemption is a payment method, not new revenue.
4. Refunds and edits are booked on the event date by default (matches Shopify's sales
   reports). Order-date restatement is an optional policy.
5. Store-level ad spend is exact. Order, product and campaign profit allocations are **modeled**
   and always labelled with the model name.
6. Reports are labelled **"Management report (operational estimate) — not an accounting statement."**
7. Demo data is never shown without a banner and never mixed with live data.

## 5. Non-functional requirements
- **Security:**
  - tokens encrypted at rest (AES-256-GCM, key from secret manager);
  - no secrets in client bundles;
  - HMAC-verified webhooks;
  - CSRF/OAuth state;
  - row-level tenant scoping enforced in the data-access layer, plus Postgres RLS as defence in depth (Phase 2 decision);
  - audit log.
- **Performance:** dashboard queries < 1 s p95 for 100k orders per store (pre-aggregated daily facts);
  incremental webhook-to-dashboard latency < 2 min.
- **Reliability:** idempotent jobs, retries with backoff, a dead-letter list visible in the Sync Center.
- **Accessibility:** WCAG 2.2 AA target; keyboard navigation; non-colour encodings in charts.
- **Responsive:** 360 px to desktop; the sidebar collapses to a drawer.
- **Observability:** structured JSON logs with request/job IDs; error monitoring hook.

## 6. External dependencies & technical unknowns

| # | Item | Status | Impact | Plan |
|---|---|---|---|---|
| U1 | **Shopify app distribution for non-Plus stores.** Custom distribution = 1 store per app (or 1 Plus org); a public listing requires an embedded experience. | DOCUMENTED | Multi-store for the owner's own stores | M1: Dev Dashboard app with custom distribution installed on Luraflo; the data model supports **multiple app credentials** (one per store) and a future public app. |
| U2 | `read_all_orders` approval for a Dev Dashboard custom app | UNKNOWN | History beyond 60 days (Luraflo is ~3 months old) | Request it in Phase 4; until granted, import the last 60 days and show "history limited" state. |
| U3 | Admin-created custom apps no longer creatable | DOCUMENTED (date unverified) | Rules out the simplest token path | Use the Dev Dashboard. |
| U4 | **Google Ads access** — developer tokens sunset 2026-09-09; access levels on the Google Cloud project (Explorer auto: 2,880 ops/day, production allowed; Basic after brand verification) | DOCUMENTED (Google docs) | Phase 6 feasibility | Owner creates a Google Cloud project + OAuth client; Explorer suffices for daily spend sync. OAuth consent in "Testing" mode means refresh tokens expire after 7 days → publish the consent screen (sensitive-scope verification needed for external users). |
| U5 | Meta Marketing API — `ads_read` Standard Access sufficient for own ad accounts | UNVERIFIED (docs blocked) | Phase 8 | Verify when the docs host is allowed. |
| U6 | TikTok Marketing API app review | UNVERIFIED | Phase 8 | Optional. |
| U7 | Exact semantics of `totalShippingPriceSet`, `currentSubtotalPriceSet`, sales agreements on edited orders | Ambiguous docs | Revenue decomposition | Validate against real Luraflo orders + fixture tests in Phase 4/5. |
| U8 | Shopify Payments fee availability per transaction (`OrderTransaction.fees` vs balance transactions) | DOCUMENTED (fees exist only for Shopify Payments) | Fee accuracy | Prefer transaction fees; reconcile with balance transactions; rule fallback. |
| U9 | Hosting / infrastructure accounts (Postgres, Redis, app host) | Needs owner | Phase 9 deploy | Default: Neon/Supabase Postgres, Upstash Redis, Railway/Fly for web + worker. |
| U10 | GitHub repository + push access | Needs owner | Persistence across sessions | Owner creates the repo and reconnects GitHub. |
| U11 | Network allow-list for `*.myshopify.com`, `googleads.googleapis.com`, `oauth2.googleapis.com`, `accounts.google.com`, `openexchangerates.org` (or an alternative FX source) | Needs owner | Integration tests from this environment | Request before Phase 4. |
| U12 | FX rate source (historical daily rates) | Decision | Multi-currency correctness | Phase 2: evaluate ECB (free, EUR-based, no key) vs openexchangerates (key). |

## 7. Success metrics (internal)
- Reconciliation: synced order count and gross sales per day match Shopify within 0 orders / 0.01 currency for closed days.
- 100 % of dashboard numbers reproducible from the calculation trace.
- Financial test suite covering every scenario listed in the master brief §7 passes.
- Dashboard p95 < 1 s on the seeded 100k-order dataset.
