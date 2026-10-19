# Project Status

_Last updated: 2026-10-19_

## Current phase
**Phase 8 — Additional integrations: COMPLETE, awaiting owner approval** ("CONFIRM PHASE 8") (2026-10-19).
Scope confirmed by the owner: full M3, verified against current docs; hosts allowed by the owner (B9). TikTok is
blocked (docs CDN host + app review, see below). Phase 7 approved on 2026-10-19 ("CONFIRM PHASE 7"). Phase 6 was
approved with the live Google Ads check deferred until the owner completes B4 (resume steps below still apply).

Phase 8 scoping facts (2026-10-19): the owner's only connected ad platform is Google Ads (TrueProfit
`get_connected_platforms`: no Meta, TikTok or others); Luraflo's only payment gateway is Shopify Payments (33
transactions, exact fees already); 31 of 32 orders carry `utm_source=google`. Every Phase 8 host was initially blocked by the
container network policy: graph.facebook.com, developers.facebook.com, business-api.tiktok.com, api.stripe.com,
docs.stripe.com, api-m.paypal.com, developer.paypal.com and all FX sources (B2).

Phase 8 plan:
1. FX: rate provider (ECB daily reference rates, via one allowed FX host), daily import job, FX-converted
   consolidated P&L and comparison across currencies (rates stored in `fx_rate`; missing rates flagged, never 1:1).
2. Meta Ads: connection (system-user or user token for the owner's own ad accounts), account discovery and mapping,
   daily campaign spend + platform value sync with restatement window, same double-counting rules as Google (D-042).
3. TikTok Ads: same shape as Meta if API access is granted (app review, U6); otherwise documented as blocked.
4. Payment fees: Stripe balance transactions and PayPal transaction search matched to Shopify transactions, so
   third-party gateway fees become actual instead of rule estimates.
5. Verification against current docs, live runs where the owner has accounts, docs and report.
`SHOPIFY_*` are cloud environment variables. **Never ask for these or Google credentials in chat, never print them.**

Phase 7 plan (PRODUCT_REQUIREMENTS M2):
1. Profit variance bridge (what changed net profit vs the comparison period).
2. P&L: store comparison, consolidated multi-store view (FX-converted where rates exist), XLSX and PDF export.
3. Customer analytics: new vs returning, repeat rate, observed LTV, monthly cohorts, blended CAC.
4. Ads profitability page: per campaign spend, platform-reported value/ROAS, break-even ROAS, and modeled
   (Shopify UTM last-touch) revenue and contribution — always labelled.
5. Product detail view and explicit, labelled ad-allocation methods.
6. Team: members, roles (owner/admin/editor/viewer), invitations.
7. Shipping: weight-tiered rules (zones = country sets, already supported).

## Resume Phase 6 (new session, after the owner adds the Google key)
1. Fresh-container setup below (Postgres, install, `.env.local`, migrate — migrations up to `0004_ads_sync`).
2. Check without printing: `for v in GOOGLE_ADS_SERVICE_ACCOUNT_KEY GOOGLE_ADS_LOGIN_CUSTOMER_ID; do [ -n "${!v}" ] && echo "$v set"; done`.
3. Reload Luraflo if the DB is empty (step 4 below), then `pnpm --filter @profitlens/worker sync ads-connect <email>`
   → `… ads-accounts <email>` → ask the owner which account belongs to Luraflo → `… ads-map <email> <adAccountId> <storeId>`
   → `… ads-sync <adAccountId>`.
4. Verify against Google Ads (spend per day/campaign for recent days, account currency/time zone), check the dashboard's
   ad spend, ROAS and contribution after ads, record findings in `docs/INTEGRATIONS.md`, commit, report.

## Fresh-container setup (any new session)
1. `pg_ctlcluster 16 main start`. If the `profitlens` role is missing (password auth fails):
   `su postgres -c "psql -c \"CREATE ROLE profitlens LOGIN PASSWORD 'profitlens' CREATEDB\" -c 'CREATE DATABASE profitlens OWNER profitlens' -c 'CREATE DATABASE profitlens_test OWNER profitlens'"`.
2. `pnpm install`; if `apps/web/.env.local` is missing: `cp .env.example apps/web/.env.local`, fill dev values
   (random BETTER_AUTH_SECRET, ENCRYPTION_KEYS `{"dev1":"<base64 32 bytes>"}` + ENCRYPTION_ACTIVE_KID `dev1`) and
   delete the empty `SHOPIFY_*` lines. Dev keys only, never committed. The local DB is empty in a fresh container.
3. `DATABASE_URL=postgres://profitlens:profitlens@localhost:5432/profitlens pnpm db:migrate`.
4. To reload Luraflo: sign up a local user in the web app, then `pnpm --filter @profitlens/worker sync connect <email>`,
   `… sync backfill <storeId>` (also computes profit), `… sync status`. `… sync recalc <storeId> [--force]` recomputes results.
5. Migrations now go up to `0006_payment_gateways` (Stripe/PayPal connections and imported payments).
6. In this container Node's `fetch` only uses the egress proxy with `NODE_USE_ENV_PROXY=1` (e.g.
   `NODE_USE_ENV_PROXY=1 pnpm --filter @profitlens/worker sync fx-import`). Production has direct egress.
7. Exchange rates: `… sync fx-import` (first run: 3 years of ECB history; later: the 90-day file). The worker
   imports daily at 15:25 and 21:25 UTC.
8. Meta: `… sync meta-connect <email>` (env `META_SYSTEM_USER_TOKEN`, optional `META_APP_ID`/`META_APP_SECRET`).
   Stripe/PayPal: `… sync payments-connect <email> <storeId> stripe|paypal` (env `STRIPE_SECRET_KEY` or
   `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`), `… payments-status <email>`, `… payments-sync <connectionId>`.

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

- Phase 5 (2026-10-19; see `docs/FEATURE_PARITY.md` "Phase 5 status", decisions D-033…D-040):
  - `packages/finance/src/engine`: pure order-profit engine (v1.0.1) + expense allocation, FINANCIAL_MODEL §11 tests;
  - migration `0003_profit_results` (`order_daily_result`, `order_cogs_line`, `order_profit` additions);
  - `packages/core/src/profit`: ProfitService (recalc with inputs hash, aggregation, amount reconciliation),
    DbReportingDataSource (live reports), cost services (product costs + CSV, shipping/handling, fees, expenses, policy);
  - sync recalculates changed orders; worker queue `profit.recalc-store`; CLI `sync recalc`;
  - web: live dashboard/orders/products/P&L, cost pages, editable versioned policy; reports default to the connected store;
  - verified on Luraflo (see TESTING.md).

- Phase 6 code (2026-10-19; `docs/FEATURE_PARITY.md` "Phase 6 status", D-041…D-043): `packages/google-ads`, core ads
  services (connect, discovery, mapping, 6-hourly spend sync with restatements, manual spend), Settings Google Ads card,
  Costs → Ad spend page, worker queues + CLI, migration `0004_ads_sync`, setup guide `docs/GOOGLE_ADS_SETUP.md`.

- Phase 7 (2026-10-19; `docs/FEATURE_PARITY.md` "Phase 7 status", D-044…D-049, FINANCIAL_MODEL §9a):
  - profit bridge on the dashboard; P&L by store with a same-currency consolidated column; Excel and PDF export;
  - Customers page (new/returning, repeat rate, observed LTV, LTV:CAC, cohorts), verified against ShopifyQL on Luraflo;
  - Advertising page (campaign spend, platform vs UTM-modeled ROAS, break-even marking, unattributed revenue);
  - product detail page and optional, labelled ad-spend allocation (net sales or units);
  - Settings → Team (one-time email-bound invitation links, roles, last-owner guard, workspace switch);
  - weight-tiered shipping rules; migration `0005_team_weight_shipping`.

- Phase 8 (2026-10-19; `docs/FEATURE_PARITY.md` "Phase 8 status", `docs/INTEGRATIONS.md` "Phase 8 integrations",
  D-050…D-052, FINANCIAL_MODEL §5.4 step 5):
  - FX: ECB rate import (worker twice daily, CLI `fx-import`; live: 22,777 rates over 766 days) and day-by-day
    FX consolidation of multi-currency store comparisons; foreign-currency ad spend converted;
  - Meta Ads (`packages/meta-ads`): system-user token with 60-day refresh, discovery, mapping, 6-hourly campaign
    spend + platform value sync; Settings card; setup guide `docs/META_ADS_SETUP.md`;
  - Stripe/PayPal (`packages/payments`, `core/payments`): read-only import, amount + time matching, actual fee on
    matched orders (engine 1.1.0), unmatched list in Settings; worker queue every 6 h; guide
    `docs/PAYMENT_GATEWAYS_SETUP.md`; migration `0006_payment_gateways`;
  - TikTok: not built (blocked, see B10).

## In progress
- Waiting for "CONFIRM PHASE 8". Phase 6 live verification still pending B4.

## Pending (by phase)
- Phases 3–9 as per the master brief.

## Known bugs / limitations
- Dashboard card selection is per browser (localStorage), not per user yet (D-023).
- Auth rate limiting uses in-memory storage (single instance only) (D-021).
- Per-order cost overrides are supported by the engine but have no UI yet.
- Product report uses event dates even when the policy restates refunds onto order dates (store totals follow the policy).
- Disputes not linked to an order are stored but not costed.
- Tax-inclusive pricing, fee tax and lost-chargeback refunds are implemented per D-036 but unverified on real data.
- Webhooks cannot be received in development (D-029).
- Meta, Stripe and PayPal are tested against recorded-shape fakes only: the owner has no Meta ad account, and
  Luraflo takes payments only through Shopify Payments.
- Processor refund and dispute fees are not imported; matching relies on Shopify gateway names containing
  "stripe"/"paypal" (INFERRED).
- Cohorts and LTV only see stored history: without `read_all_orders` (B7) Luraflo's history starts 2026-10-05, so
  earlier customers count as new (shown as a warning).
- UTM-modeled attribution needs orders tagged with `utm_campaign`; Google auto-tagging alone (gclid) is not matched.
- No email delivery yet: invitation links are shared by the inviter; the workspace switcher lives on the Team page.
- Weight-tiered shipping uses the variant's current weight (Shopify keeps no history).
- `next start` warns because `output: "standalone"` is set; production will run `node .next/standalone/server.js` (Phase 9 Docker).

## External blockers / owner actions
| # | Item | Needed by |
|---|---|---|
| B1 | ~~GitHub repo~~ RESOLVED: `yavia369/ProfitLens` (private since 2026-10-18). | — |
| B2 | Network: Shopify, Google, ECB and Phase 8 provider hosts allowed. Still blocked: `app.trueprofit.io`, `be.trueprofit.io` (reference only) | — |
| B3 | ~~Shopify app + env vars~~ RESOLVED 2026-10-19 (connected, verified). | — |
| B7 | Optional: `read_all_orders` for full history (today 1 order, #1001 from 2026-07-27, is outside the 60-day window). Unknown whether a Dev Dashboard app can be granted it | Before relying on history older than 60 days |
| B8 | **Owner action:** Luraflo has no product costs (41 sold variants, 7,817 total) and no shipping rule, so every order is flagged incomplete and profit is overstated. Enter costs on Product costs (export CSV → fill → import), add a shipping rule and the running expenses (Shopify plan, apps) | Accurate profit figures |
| B6 | Webhook delivery needs a public URL; until Phase 9 the 15-min poll covers it (D-029) | Phase 9 |
| B4 | **Owner action:** Google Cloud project with Google Ads API Explorer access + service account key, added as a read-only user in Google Ads — steps in `docs/GOOGLE_ADS_SETUP.md` (sent 2026-10-19) | Phase 6 live verification |
| B9 | ~~Network allow-list for Phase 8~~ RESOLVED 2026-10-19 (Meta, Stripe, PayPal, ECB, TikTok portal reachable). B2's FX part is resolved by the ECB host | — |
| B10 | **Owner action (optional, TikTok):** allow `sf16-website-login.neutral.ttwstatic.com` (the TikTok API portal loads its docs from it), and for live use: a TikTok developer app with app review plus a TikTok ad account | TikTok Ads integration |
| B5 | Hosting accounts (Postgres, Redis, app host) | Phase 9 |

## Next tasks
1. Owner: review the Phase 8 report and reply "CONFIRM PHASE 8"; optionally B10 (TikTok); B4 (Google Ads access,
   then "Continue Phase 6" for the live check); B8 (Luraflo costs, shipping rule, expenses).
2. Phase 9 (after approval), per the master brief.

## Test results
- 2026-10-19 (Phase 8): `pnpm test` 209/209, `pnpm typecheck`, `next build`, Playwright 12/12; live ECB import; Luraflo recalculated on engine 1.1.0.
- 2026-10-19 (Phase 7): `pnpm test` 177/177, `pnpm typecheck`, `next build`, Playwright 12/12; Luraflo customers = ShopifyQL.
- 2026-10-19 (Phase 6): `pnpm test` 148/148, `pnpm typecheck`, `next build`, Playwright 12/12; live Google Ads run pending B4.
- 2026-10-19 (Phase 5): `pnpm test` 129/129, `pnpm typecheck`, `next build`, Playwright 12/12; live Luraflo checks pass.
- 2026-10-19 (Phase 4 live): Luraflo verification passed (see above); `pnpm test` 81/81, `pnpm typecheck`,
  `next build`, Playwright 10/10.
- 2026-10-18 (Phase 4): `pnpm test` 81/81 passed; `pnpm typecheck` and `next build` pass; Playwright 10/10 passed.
  Live Shopify verification not yet run.
- 2026-10-18: `pnpm test` 45/45 passed; `pnpm typecheck` passes; `next build` passes; Playwright 10/10 passed
  (desktop + mobile). Details in `docs/TESTING.md`.
