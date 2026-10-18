# Project Status

_Last updated: 2026-10-18_

## Current phase
**Phase 4 — Shopify Connection: CODE COMPLETE, live verification on Luraflo pending owner credentials.**
Phases 1–3 approved; Phase 4 approved 2026-10-18 (including installing a read-only ProfitLens app on Luraflo).
The owner is following `docs/SHOPIFY_SETUP.md` and will add `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` and
`SHOPIFY_SHOP_DOMAIN=gpnj6g-tr.myshopify.com` as cloud environment variables, then start a new session with
"Continue Phase 4". **Never ask for these values in chat.**

## Resume Phase 4 (new session)
1. `pg_ctlcluster 16 main start` and `pnpm install`.
2. If `apps/web/.env.local` is missing (container is fresh): `cp .env.example apps/web/.env.local` and fill dev values
   (DATABASE_URL `postgres://profitlens:profitlens@localhost:5432/profitlens`, a random BETTER_AUTH_SECRET, and
   ENCRYPTION_KEYS `{"dev1":"<base64 32 bytes>"}` + ENCRYPTION_ACTIVE_KID `dev1`). Dev keys only, never committed.
   A new key means previously stored encrypted secrets cannot be decrypted; reconnect the store.
3. `DATABASE_URL=… pnpm db:migrate`.
4. Check the env vars exist without printing them:
   `for v in SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET SHOPIFY_SHOP_DOMAIN; do [ -n "${!v}" ] && echo "$v set"; done`.
5. Create a local user (sign up in the web app, or reuse one), then
   `pnpm --filter @profitlens/worker sync connect <user-email>` (reads SHOPIFY_* from env), then
   `… sync backfill <storeId>` and `… sync status <storeId>`.
6. Verify against Shopify (Shopify MCP connector, read-only): order count per day for recent days, a sample order's
   line items/refunds/transactions/fees, product unit costs. Record findings for the UNKNOWNs in `docs/INTEGRATIONS.md`
   (read_all_orders grant, SalesAgreement/Sale GID formats, tax-inclusive AUD amounts, ordersCount parity).
7. Run `… sync reconcile <storeId>`; check the Sync Center (`/settings/sync`) in the web app.
8. Update docs, commit, push, then send the Phase 4 report and ask for approval.

## Completed
- REA installed for Claude Code (v6.7.0) and verified (MCP tools listed; CLI used for long runs).
- TrueProfit investigation (see `docs/research/`):
  - feature inventory, UI analysis, user flows, technical findings, parity matrix;
  - raw cited notes: help centre (128 articles), product updates/solution pages (32 pages),
    Shopify / Google Ads / Meta / TikTok API research;
  - TrueProfit connector schema evidence from the Luraflo store (read-only);
  - REA network capture + screenshot of the public site.
- Product requirements, MVP priorities, technical unknowns: `docs/PRODUCT_REQUIREMENTS.md`.

- Phase 2:
  - stack selected (ARCHITECTURE §1; decisions D-012…D-019);
  - architecture, security model, deployment, roadmap: `docs/ARCHITECTURE.md`;
  - financial calculation spec: `docs/FINANCIAL_MODEL.md`;
  - integration strategy: `docs/INTEGRATIONS.md`;
  - monorepo scaffold (pnpm + turbo, TS 6 strict), `packages/config` (zod env validation);
  - `packages/db`: Drizzle schema (41 tables), migrations `0000_init` + `0001_integrity_constraints`,
    tenant-scope helpers, 12 passing Postgres integration tests;
  - CI workflow (typecheck + tests with a Postgres service).

- Phase 3:
  - `packages/finance`: decimal money helpers, metric registry (single definition per metric), completeness,
    store-timezone date presets/comparisons/buckets, default financial policy;
  - `packages/core`: ReportingDataSource interface, ReportingService (dashboard + P&L payloads),
    deterministic in-memory demo store (AUD, Australia/Sydney) that reconciles exactly;
  - `apps/web`: Next.js 16 app — Better Auth (email/password, org bootstrap, rate limits), app shell,
    design system (light/dark), dashboard, orders (+ calculation drawer), products, P&L, settings,
    planned-phase pages, zod-validated report APIs (money as strings), CSV export;
  - Playwright e2e (desktop + mobile) and CI e2e job.

- Phase 4 (code; see `docs/INTEGRATIONS.md` "Shopify implementation"):
  - `packages/shopify`: GraphQL Admin client (cost throttling, retries), client-credential auth, HMAC helpers,
    queries (paged + bulk), bulk JSONL assembly, mappers;
  - `packages/core`: AES-256-GCM credential encryption with key rotation, store connection, idempotent upserts,
    effective-dated Shopify cost versions, ShopifySyncService (backfill, incremental, single order, disputes,
    reconciliation), webhook handler, pg-boss queue helpers;
  - `apps/worker`: pg-boss worker with crons + `sync` CLI;
  - `apps/web`: connect-store form, Sync Center, webhook route, live stores in the store switcher with an
    explanatory "profit engine pending" state (409) until Phase 5;
  - migration `0002_sync_checkpoints`; per-suite test databases.

## In progress
- Phase 4 live verification on Luraflo (blocked on B3 credentials).

## Pending (by phase)
- Phases 3–9 as per the master brief.

## Known bugs / limitations
- Dashboard card selection is per browser (localStorage), not per user yet (D-023).
- Auth rate limiting uses in-memory storage (single instance only) (D-021).
- Live store reports show "profit engine pending" until Phase 5 (D-028).
- Webhooks cannot be received in development (D-029).
- `next start` warns because `output: "standalone"` is set; production will run `node .next/standalone/server.js` (Phase 9 Docker).

## External blockers / owner actions
| # | Item | Needed by |
|---|---|---|
| B1 | ~~GitHub repo~~ RESOLVED: `yavia369/ProfitLens` (private since 2026-10-18). | — |
| B2 | Network: Shopify + Google hosts now allowed (verified 2026-10-18). Still blocked: FX-rate hosts (openexchangerates.org, ECB, frankfurter), `app.trueprofit.io`, `be.trueprofit.io`, `developers.facebook.com` | FX needed for multi-currency tests against live rates (Phase 5+) |
| B3 | Shopify: approval GIVEN. Owner creates the Dev Dashboard app per `docs/SHOPIFY_SETUP.md` and adds SHOPIFY_* env vars to the cloud environment | Phase 4 live verification |
| B6 | Webhook delivery needs a public URL; until Phase 9 the 15-min poll covers it (D-029) | Phase 9 |
| B4 | Google Cloud project + OAuth client (Google Ads API access level Explorer/Basic) | Phase 6 |
| B5 | Hosting accounts (Postgres, Redis, app host) | Phase 9 |

## Next tasks
1. Phase 4 live verification (see "Resume Phase 4"), Phase 4 report, wait for approval.
2. Phase 5 (after approval): profit engine (order results from ledger + costs + fees + policy), cost management
   pages (product costs, shipping, fees, expenses), DB-backed ReportingDataSource for live stores.

## Test results
- 2026-10-18 (Phase 4): `pnpm test` 81/81 passed; `pnpm typecheck` and `next build` pass; Playwright 10/10 passed.
  Live Shopify verification not yet run.
- 2026-10-18: `pnpm test` 45/45 passed; `pnpm typecheck` passes; `next build` passes; Playwright 10/10 passed
  (desktop + mobile). Details in `docs/TESTING.md`.
