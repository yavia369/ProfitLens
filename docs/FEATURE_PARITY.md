# Feature Parity (living document)

The canonical matrix is `docs/research/feature-parity-matrix.md`, the Phase 1 snapshot.
This file tracks **implementation progress** against it. It gets updated at the end of every phase.

| Milestone | Planned features | Implemented | Tested |
|---|---|---|---|
| M1 (Phases 3–6) | see matrix rows marked M1 | Phases 3–5: see below (Google Ads: Phase 6) | e2e + unit + integration |
| M2 (Phase 7) | see matrix rows marked M2 | 0 | 0 |
| M3 (Phase 8) | see matrix rows marked M3 | 0 | 0 |

## Phase 3 status (2026-10-18)
Implemented on the **demo data source only** (live data arrives with Phases 4–5):

| Feature | Status |
|---|---|
| Auth (email/password, sessions, org bootstrap, rate limits) | Done, e2e-tested |
| App shell: sidebar, mobile drawer, store switcher, theme (light/dark/system) | Done |
| Date presets in store timezone, custom range, comparison modes, URL-persisted | Done (unit + e2e) |
| Dashboard: configurable KPI cards, deltas with polarity, formula popovers, completeness warnings, performance/margin/orders charts, cost breakdown, ad spend by channel, auto-refresh + last-updated | Done (demo data) |
| Orders report: search, sort, pagination, calculation drawer with sources | Done (demo data) |
| Products: variant gross profit, filters (loss-making, missing cost), CSV export | Done (demo data) |
| P&L: daily/weekly/monthly, expandable ad spend, memo lines, management-report label, CSV | Done (demo data) |
| Settings: stores list, default calculation policy (read-only) | Done |
| Costs pages, advertising, customers | Planned-state pages naming their phase (not functional) |


## Phase 4 status (2026-10-18)
| Feature | Status |
|---|---|
| Connect a Shopify store (UI form + CLI), credentials encrypted, scope check | Done, integration-tested with a fake Shopify; **live run pending credentials** |
| Historical import (bulk), incremental sync (15 min), single-order refresh | Done, integration-tested; live run pending |
| Shopify product costs → effective-dated cost versions | Done, tested |
| Webhooks (orders, refunds, products, disputes, uninstall, GDPR) | Done, tested; live delivery blocked until deployment |
| Daily order-count reconciliation | Done, tested |
| Sync Center (status, scopes, history limit, counts, jobs, issues, latest orders, actions) | Done, e2e-tested (empty state) |
| Profit reports for live stores | Superseded by Phase 5 (D-028 replaced by D-034) |

## Phase 5 status (2026-10-19)
| Feature | Status |
|---|---|
| Finance engine: revenue components from the event-dated ledger, COGS with effective-dated landed costs and return reversals, shipping/handling rules, transaction fees (actual, rule, Shopify third-party fee), chargebacks, completeness flags, per-order trace | Done; FINANCIAL_MODEL §11 matrix covered (finance 57 tests) |
| Recalculation (inputs hash, after every sync, after cost changes; background job for large stores) and daily aggregation | Done, integration-tested, run live on Luraflo |
| Amount reconciliation (aggregates vs independent ledger SQL) | Done, tested; live: 0 mismatches over 30 days |
| Live reports: dashboard, orders + calculation drawer, products, P&L for connected stores | Done; live revenue per day equals Shopify net sales |
| Product costs: per variant or whole product, effective dates, history, CSV import (preview/diff) and export | Done, integration + e2e tested |
| Shipping rules (per order, per item, first + additional, tiers; countries; priority; dates), handling rules (one handling mode) | Done, tested |
| Fee rules per gateway, Shopify third-party fee rate, gateway overview with actual effective rates | Done, tested |
| Custom expenses (one-time, recurring spread/on-date, per order, % of revenue/net sales/ad spend; marketing categories; as ad spend) | Done, tested (applied on read) |
| Versioned calculation policy (owners/admins), full recalculation on change | Done, tested |
| Manual ad spend entry UI, Google Ads | Done in Phase 6 (below) |
| Per-order cost overrides UI | Engine and storage done; UI not built (later phase) |

## Phase 6 status (2026-10-19)
| Feature | Status |
|---|---|
| Connect Google Ads (service account), discover accounts incl. manager children, map accounts to stores | Done, integration + e2e tested; **live run pending owner setup (B4)** |
| Daily campaign spend sync: 3-year backfill, 6-hourly runs re-reading the last 3 days, restatement detection | Done, integration-tested with a fake Google Ads API |
| Manual ad spend (Meta/TikTok/other; adjustments; ranges) with double-counting guard | Done, tested |
| Ad spend in dashboard KPIs, channel breakdown (platform-reported ROAS), P&L | Done (uses the Phase 5 reporting) |
| Time-zone approximation label for ad accounts in another zone | Done |
| Ad-group level, ads profitability views, Advertising page | Phase 7 |
| FX conversion of foreign-currency ad accounts | Engine ready; rate provider blocked (B2) |

## Phase 7 status (2026-10-19)
| Feature | Status |
|---|---|
| Profit variance bridge on the dashboard (volume, order value, each cost line) | Done, unit + demo tested, visually checked |
| P&L by store with consolidated column (same currency) | Done; FX-converted consolidation waits for a rate source (B2) |
| P&L export to Excel (XLSX) and PDF, by period or by store | Done, round-trip tested, e2e download |
| Customers: new/returning, repeat rate, orders per customer, observed LTV (revenue and gross profit), LTV:CAC, cohorts (revenue, gross profit, retention) | Done; **VERIFIED** against ShopifyQL on Luraflo (32 customers, 32 new, 0 returning, 20 Sep – 19 Oct) |
| Advertising: per-campaign spend, platform ROAS, UTM-modeled orders/revenue/ROAS/profit after ads, break-even marking, unattributed revenue with reasons | Done (demo + DB tests); live Google campaigns pending B4; Luraflo shows the empty state (no ad spend) |
| Product detail page; optional ad-spend allocation by net sales or units (labelled estimates) | Done |
| Team: invite by one-time link, roles (owner/admin/editor/viewer), change role, remove, leave, last-owner guard, workspace switch | Done, integration + e2e tested; no email sending yet (link shared by the inviter) |
| Weight-tiered shipping rules | Done; Luraflo variants mostly have 0 g in Shopify, which the rule treats as unknown (D-048) |
| Pixel-based multi-touch attribution, AI bill extraction, email reports | Not in M2 scope |

## Phase 8 status (2026-10-19)
| Feature | Status |
|---|---|
| FX: ECB reference rates imported daily (3-year history on first run); multi-currency store comparison consolidated into a chosen currency; foreign-currency ad spend converted | Done; live import VERIFIED (22,777 rates, 766 days); unit + integration tested |
| Meta Ads: system-user token (60-day refresh with app ID/secret), account discovery, store mapping, daily campaign spend + Meta-reported purchase value, 6-hourly sync with 3-day restatement window | Done, tested against recorded-shape fakes; **no live run** (owner has no Meta ad account) |
| TikTok Ads API | **Blocked**: docs portal CDN host refused by the network policy; needs app review and an advertiser account. Manual TikTok spend remains available |
| Stripe / PayPal fees: read-only import, match to Shopify payments by amount + currency ± 15 min (exactly one candidate), actual fee on matched orders, reconciliation list of unmatched/ambiguous payments | Done, unit + integration + e2e tested; **not applicable to Luraflo** (Shopify Payments only, fees already actual) |
