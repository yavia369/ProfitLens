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
| Costs pages, advertising, customers, sync center | Planned-state pages naming their phase (not functional) |

