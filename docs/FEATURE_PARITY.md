# Feature Parity (living document)

The canonical matrix is `docs/research/feature-parity-matrix.md`, the Phase 1 snapshot.
This file tracks **implementation progress** against it. It gets updated at the end of every phase.

| Milestone | Planned features | Implemented | Tested |
|---|---|---|---|
| M1 (Phases 3–6) | see matrix rows marked M1 | Frontend foundation (Phase 3): see below | e2e + unit |
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
| Profit reports for live stores | Deliberately blocked with an explanatory state until Phase 5 (D-028) |
