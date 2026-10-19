# ProfitLens

Shopify profit analytics with auditable, decimal-accurate calculations: revenue, COGS, shipping, handling,
transaction fees (Shopify-reported or matched from Stripe/PayPal), chargebacks, ad spend (Google, Meta, manual)
and expenses, aggregated into net profit per store, day, order, product, campaign and customer cohort. Every figure
can be traced to the stored facts and the rule that produced it; unknown costs are flagged, never treated as zero.

Status: feature-complete for milestones M1–M3 and hardened (Phase 9); see `docs/PROJECT_STATUS.md`. Deployment
needs a hosting account (docs/DEPLOYMENT.md).

## Owner setup guide
1. **Deploy** the Docker image (any Docker host with `docker compose`, or a container platform) and set the five
   required environment variables — `docs/DEPLOYMENT.md`.
2. **Sign up** at your `APP_URL`. The first account owns its workspace; invite others under Settings → Team.
3. **Connect Shopify** (read-only Dev Dashboard app) — `docs/SHOPIFY_SETUP.md`. History imports automatically;
   follow it in Settings → Sync Center. After deployment register webhooks (`cli webhooks-register`).
4. **Enter costs** under Costs: product costs (or CSV import), shipping and handling rules, fee rules for
   non-Shopify gateways, running expenses. Orders without a cost are marked incomplete until you do.
5. **Optional integrations** (Settings → Stores & integrations):
   Google Ads — `docs/GOOGLE_ADS_SETUP.md`; Meta Ads — `docs/META_ADS_SETUP.md`;
   Stripe/PayPal fees — `docs/PAYMENT_GATEWAYS_SETUP.md`. Other channels: Costs → Ad spend (manual).
6. Review the calculation policy (Settings → Calculation policy); exchange rates (ECB) import automatically.

Keys and tokens go only into the app's forms or the hosting platform's secret settings — never into chat, email or
the repository.

## Repository
| Path | Contents |
|---|---|
| `apps/web` | Next.js 16 app (reports, settings, API routes, server actions) |
| `apps/worker` | Background jobs (pg-boss) and the operator CLI |
| `packages/finance` | Pure calculation engine and metric definitions (decimal money only) |
| `packages/core` | Services: Shopify sync, profit recalculation, reporting, costs, ads, payments, FX, team, ops |
| `packages/db` | PostgreSQL schema (Drizzle) and migrations |
| `packages/shopify`, `google-ads`, `meta-ads`, `payments` | API clients |
| `packages/config` | Validated server environment |
| `docs/` | Requirements, architecture, financial model, integrations, decisions, testing, security, deployment |

## Local development
Requirements: Node 22.19+, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example apps/web/.env.local     # fill in dev values; never commit it
pnpm db:migrate                         # DATABASE_URL
pnpm typecheck && pnpm test             # tests need TEST_DATABASE_URL (Postgres)
cd apps/web && npx next build && npx next start      # http://localhost:3000
pnpm --filter @profitlens/worker dev    # background jobs (separate terminal)
pnpm --filter @profitlens/web e2e       # Playwright, app running on :3000
```

Performance check (synthetic 100k-order store in its own database):
`PERF_DATABASE_URL=…/profitlens_perf pnpm --filter @profitlens/core exec tsx perf/seed.ts` then `… perf/bench.ts`.
