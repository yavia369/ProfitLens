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
  Each integration suite uses its own database `<name>_<suite>` (e.g. `profitlens_test_db`, `profitlens_test_core`),
  created on demand and re-migrated at start (`freshTestDatabase` in `@profitlens/db/testing`), so suites can run in parallel.
  The role needs `CREATEDB` (true for the local container role and the CI service user).
- Shopify is never called from tests: `packages/core` integration tests drive the full sync through an in-memory fake of
  the token, GraphQL, bulk and JSONL endpoints (`fakeShopify`).

## Current results
| Date | Command | Result |
|---|---|---|
| 2026-10-18 | `pnpm --filter @profitlens/db test` | 12/12 passed (money precision, effective-dated cost lookup, overlap exclusion, interval/negative checks, idempotent upsert with stale-update guard, webhook dedupe, expense type checks, tenant isolation, cascade delete, store constraints) |
| 2026-10-18 | `tsc --noEmit` (db, config) | pass |
| 2026-10-18 | `pnpm test` (all packages) | 45/45 passed — finance 17 (money, metric registry, completeness, timezone/DST presets, comparisons), core 10 (demo determinism, no future events, full-history reconciliation of daily totals vs order results, missing-cost flags, effective-dated cost change, order breakdown sums, dashboard/P&L consistency), db 12, web 6 (formatting exactness, accounting display, CSV escaping/injection) |
| 2026-10-18 | `pnpm typecheck` | pass (5 packages) |
| 2026-10-18 | `next build` (apps/web) | pass |
| 2026-10-18 | `playwright test` (desktop 1440×900 + Pixel 7) against production build | 10/10 passed — auth redirect, sign-up → demo dashboard (banner, incompleteness warning, KPIs, chart), URL-persisted date preset, wrong password rejected, orders + order calculation drawer, products, P&L with expandable ad spend, policy page, planned-phase page, mobile navigation drawer, sign out |
| 2026-10-18 (Phase 4) | `pnpm test` (all packages) | 81/81 passed — finance 17, shopify 21 (cost throttling/retries, HMAC (OAuth query + webhook), client-credential token parsing, bulk JSONL assembly, order/product mappers incl. store-timezone dating, agreements→sales ledger, refunds with restock type, transaction fees; bulk queries within connection limits; orphan JSONL lines rejected), core 25 (demo 10; crypto 4: round trip with unique ciphertexts, tamper/wrong-context rejection, key rotation, constant-time compare; Shopify sync integration 11 against real Postgres + fake Shopify: connect stores facts/encrypts secrets/creates policy + audit, missing scopes refused without persisting, same store blocked in a second workspace, idempotent bulk backfill of products and orders with all child facts, incremental ignores stale payloads, Shopify cost changes versioned by date without overriding manual costs, daily order-count reconciliation, stored token reuse, webhooks (signature check, dedupe, order refresh enqueue; uninstall + shop redaction), store-local day bounds across Sydney DST), db 12, web 6 |
| 2026-10-18 (Phase 4) | `pnpm typecheck`, `next build` | pass |
| 2026-10-18 (Phase 4) | `playwright test` | 10/10 passed — adds Sync Center empty state and the connect-store form (password field, server-side domain validation before any Shopify call) |
| 2026-10-19 (Phase 4 live) | `sync connect/backfill/incremental/reconcile` against Luraflo + Shopify connector cross-checks | pass after 2 fixes (D-031, D-032): daily order counts, gross sales, discounts and net sales identical to ShopifyQL; reconcile 0 mismatches over 30 days; sample refund/fees match. Details in `docs/INTEGRATIONS.md` "Live verification" |
| 2026-10-19 (Phase 4 live) | `pnpm test` | 81/81 passed (bulk tests now assert refund lines are absent from bulk output, flagged for refetch, and rejected by the mapper if unfetched; fake Shopify emits bulk JSONL without refund lines like Shopify does) |
| 2026-10-19 (Phase 4 live) | `pnpm typecheck`, `next build`, `playwright test` | pass; Playwright 10/10 |
| 2026-10-19 | Sync Center (`/settings/sync`) with the live store | renders Luraflo: counts, 60-day history badge, job history incl. the two failed runs with their Shopify errors, latest orders |
