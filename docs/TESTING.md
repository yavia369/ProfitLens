# Testing Strategy

## Layers
| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | `packages/finance` (pure engine, full FINANCIAL_MODEL §11 matrix), mappers, rule evaluators, crypto, HMAC | every commit |
| DB integration | Vitest + real Postgres 16 | schema constraints, idempotent upserts, tenant isolation, repositories | every commit (CI Postgres service) |
| Integration (external, recorded) | Vitest + JSONL/GraphQL fixtures | Shopify bulk JSONL parsing, webhook verification, Google Ads searchStream parsing | every commit |
| Integration (live, opt-in) | Vitest, `LIVE_SHOPIFY=1` | read-only queries against a connected store | manual |
| E2E | Playwright | onboarding, dashboard, cost editing, P&L export (demo data) | pre-release |
| Reconciliation | worker job + tests | Shopify totals vs ours per closed day | nightly in prod |

## Conventions
- Money assertions compare **strings** produced by `Decimal#toFixed` / exact decimal equality, never floats.
- Every financial bug gets a regression fixture.
- Test DB: `TEST_DATABASE_URL` (default `postgres://profitlens:profitlens@localhost:5432/profitlens_test`).
  The suite drops and re-migrates the schema at start.

## Current results
| Date | Command | Result |
|---|---|---|
| 2026-10-18 | `pnpm --filter @profitlens/db test` | 12/12 passed (money precision, effective-dated cost lookup, overlap exclusion, interval/negative checks, idempotent upsert with stale-update guard, webhook dedupe, expense type checks, tenant isolation, cascade delete, store constraints) |
| 2026-10-18 | `tsc --noEmit` (db, config) | pass |
| 2026-10-18 | `pnpm test` (all packages) | 45/45 passed — finance 17 (money, metric registry, completeness, timezone/DST presets, comparisons), core 10 (demo determinism, no future events, full-history reconciliation of daily totals vs order results, missing-cost flags, effective-dated cost change, order breakdown sums, dashboard/P&L consistency), db 12, web 6 (formatting exactness, accounting display, CSV escaping/injection) |
| 2026-10-18 | `pnpm typecheck` | pass (5 packages) |
| 2026-10-18 | `next build` (apps/web) | pass |
| 2026-10-18 | `playwright test` (desktop 1440×900 + Pixel 7) against production build | 10/10 passed — auth redirect, sign-up → demo dashboard (banner, incompleteness warning, KPIs, chart), URL-persisted date preset, wrong password rejected, orders + order calculation drawer, products, P&L with expandable ad spend, policy page, planned-phase page, mobile navigation drawer, sign out |
