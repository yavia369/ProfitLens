# Project Status

_Last updated: 2026-10-19_

## Current phase
**Phase 5 — Finance engine & cost management: IN PROGRESS** (started 2026-10-19).
Phase 4 approved by the owner on 2026-10-19 ("CONFIRM PHASE 4").
`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` and `SHOPIFY_SHOP_DOMAIN` are cloud environment variables.
**Never ask for these values in chat, never print them.**

Phase 5 plan:
1. Pure engine in `packages/finance/src/engine`: order profit (revenue components, COGS with effective-dated
   costs and return reversals, shipping/handling rules, transaction fees, chargebacks), dated per store-local day,
   with completeness and trace; expense allocation per day; FINANCIAL_MODEL §11 test matrix.
2. Result tables (`order_daily_result`, `order_cogs_line`) and a `ProfitService` in core: load inputs from the DB,
   recalculate (skipping unchanged inputs), aggregate `daily_store_metrics`, run after every sync.
3. DB-backed reporting for live stores (dashboard, orders, products, P&L), replacing the 409 state (D-028).
4. Cost management: product costs (per variant/product, CSV import), shipping and handling rules, payment fee
   rules, expenses, versioned calculation policy. Every change is audited and triggers recalculation.
5. Verify on Luraflo against Shopify, tests, docs, report.

## Fresh-container setup (any new session)
1. `pg_ctlcluster 16 main start`. If the `profitlens` role is missing (password auth fails):
   `su postgres -c "psql -c \"CREATE ROLE profitlens LOGIN PASSWORD 'profitlens' CREATEDB\" -c 'CREATE DATABASE profitlens OWNER profitlens' -c 'CREATE DATABASE profitlens_test OWNER profitlens'"`.
2. `pnpm install`; if `apps/web/.env.local` is missing: `cp .env.example apps/web/.env.local`, fill dev values
   (random BETTER_AUTH_SECRET, ENCRYPTION_KEYS `{"dev1":"<base64 32 bytes>"}` + ENCRYPTION_ACTIVE_KID `dev1`) and
   delete the empty `SHOPIFY_*` lines. Dev keys only, never committed. The local DB is empty in a fresh container.
3. `DATABASE_URL=postgres://profitlens:profitlens@localhost:5432/profitlens pnpm db:migrate`.
4. To reload Luraflo: sign up a local user in the web app, then `pnpm --filter @profitlens/worker sync connect <email>`,
   `… sync backfill <storeId>`, `… sync status`.

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
  - live verification on Luraflo (2026-10-19): connect, backfill (32 orders, 235 products, 7,817 variants,
    1 refund, 1 dispute), incremental, reconcile; cross-checked against ShopifyQL and the Shopify connector
    (counts, gross/discounts/net sales per day, fees, refund lines all identical). Two bugs found and fixed:
    bulk refund lines (D-031) and disputes scope (D-032). See `docs/INTEGRATIONS.md` "Live verification".

## In progress
- Phase 5 (see plan above).

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
| B3 | ~~Shopify app + env vars~~ RESOLVED 2026-10-19 (connected, verified). | — |
| B7 | Optional: `read_all_orders` for full history (today 1 order, #1001 from 2026-07-27, is outside the 60-day window). Unknown whether a Dev Dashboard app can be granted it | Before relying on history older than 60 days |
| B8 | Luraflo has no product unit costs in Shopify: COGS will show as missing until costs are entered (Phase 5 cost pages or Shopify admin) | Phase 5 profit figures |
| B6 | Webhook delivery needs a public URL; until Phase 9 the 15-min poll covers it (D-029) | Phase 9 |
| B4 | Google Cloud project + OAuth client (Google Ads API access level Explorer/Basic) | Phase 6 |
| B5 | Hosting accounts (Postgres, Redis, app host) | Phase 9 |

## Next tasks
1. Phase 5 (in progress): profit engine (order results from ledger + costs + fees + policy), cost management
   pages (product costs, shipping, fees, expenses), DB-backed ReportingDataSource for live stores.
2. Phase 6 (after approval): Google Ads (needs B4).

## Test results
- 2026-10-19 (Phase 4 live): Luraflo verification passed (see above); `pnpm test` 81/81, `pnpm typecheck`,
  `next build`, Playwright 10/10.
- 2026-10-18 (Phase 4): `pnpm test` 81/81 passed; `pnpm typecheck` and `next build` pass; Playwright 10/10 passed.
  Live Shopify verification not yet run.
- 2026-10-18: `pnpm test` 45/45 passed; `pnpm typecheck` passes; `next build` passes; Playwright 10/10 passed
  (desktop + mobile). Details in `docs/TESTING.md`.
