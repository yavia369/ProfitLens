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
- E2E sign-ups: the suite creates 4 accounts per run (smoke + costs, desktop + mobile); the auth limit is 5 sign-ups per
  minute per IP (D-021, in-memory), so re-running within a minute can fail sign-up — restart the server or wait.
- The costs e2e test seeds a connected store directly in Postgres (`DATABASE_URL`) for the signed-up user's workspace.
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
| 2026-10-19 (Phase 5) | `pnpm test` (all packages) | 129/129 passed — finance 57 (adds 40 engine tests covering the FINANCIAL_MODEL §11 matrix: discounts (line/order level), full/partial/late refunds and restock types, refund/chargeback dating policies, multi-product, effective-dated costs and reversal at original cost, missing costs and fallback estimate, overrides, order edits, split payments, auth+capture, gateway rules with half-up rounding, third-party fee, missing fees, chargebacks lost/won/accepted with refund de-duplication, shipping rule types/countries/priority/dates, cancelled-before-fulfilment, gift card sale and redemption, tax-inclusive and tax-exclusive, tips/duties/unclassified sales, exclusions, determinism, Σ days = lifetime; expenses: monthly spread across month boundaries, DST day, on-date, weekly, daily, one-time, end dates, per-order and % expenses, ad-spend flag, marketing memo, FX with 7-day fallback and missing rate), core 32 (adds profit results/aggregation/hash skip, cost & policy recalculation, reconciliation catching a corrupted aggregate, incremental recalculation, live reporting source incl. expenses/ad spend on read and tenant isolation, cost services: history splitting, handling mode, permissions, CSV preview/apply/blank rows/round trip, rules, fee validation messages, policy versions, expenses), shopify 21, db 12, web 7 |
| 2026-10-19 (Phase 5) | `pnpm typecheck`, `next build` | pass |
| 2026-10-19 (Phase 5) | `playwright test` | 12/12 passed — adds costs e2e (desktop + mobile): product cost for a whole product, CSV import preview with an invalid row, shipping rule, fee rule + validation error, expense, new policy version, and the recalculated order profit on the Orders page |
| 2026-10-19 (Phase 5 live) | Luraflo: `sync recalc`, `incremental`, `reconcile 30` + ShopifyQL | 32 orders computed; revenue per day = Shopify net sales on all 11 days (A$2,245.43); second run recomputes 0 (hash); incremental recalculated only the changed order; 0 order-count and 0 amount mismatches. All orders flagged incomplete (no product costs or shipping rules configured yet) |
| 2026-10-19 (Phase 6) | `pnpm test` (all packages) | 148/148 passed — adds google-ads 12 (service-account key parsing incl. base64, RS256 JWT verified with the public key, token caching/renewal and shared in-flight request, rejected key, REST headers incl. login-customer-id, retries on quota/network/5xx, no retry on permission errors with Google's code kept, unapproved Cloud project, mid-stream errors, customer-ID and date validation incl. injection attempt, exact micros beyond 2^53, campaign/manager-child mapping) and core +7 (connect + encrypted key + manager discovery + mapping kept on rediscovery; access/permission/viewer/mapping rejections; 3-year backfill in 13 windows, restatement re-read with 2 restated days incl. a campaign dropping to zero, dashboard + channel totals; sync failures recorded, 401 → needs_reauth; manual spend exact spreading, double-counting guard, API wins over earlier manual entry, adjustments, delete, tenant isolation; time-zone flag) |
| 2026-10-19 (Phase 6) | `pnpm typecheck`, `next build`, `playwright test` | pass; Playwright 12/12 (costs e2e extended: manual Meta spend on the dashboard, Google Ads key validation, account → store mapping persists and reports the failed first import) |
| — | Live Google Ads run | **Not yet run**: waiting for `GOOGLE_ADS_SERVICE_ACCOUNT_KEY` (B4, `docs/GOOGLE_ADS_SETUP.md`) |

