# Architecture

> Phase 2 (2026-10-18). Decisions are referenced as D-xxx in `DECISIONS.md`.

## 1. Stack (selected)

| Concern | Choice | Version pin | Why |
|---|---|---|---|
| Language | TypeScript, strict | 6.0.x | 7.x (native compiler) is too new for Next/ESLint tooling (D-012) |
| Runtime | Node.js | 22 LTS | Available in the dev container and on all target hosts |
| Monorepo | pnpm workspaces + Turborepo | pnpm 10, turbo 2.11 | Clear package boundaries: ingestion / finance / UI |
| Web app | Next.js App Router (React 19) | 16.4.x | SSR dashboards, route handlers for OAuth/webhooks/API |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) | 4.3.x | Owned components, accessible primitives |
| Charts | Recharts | 3.x | Composable, SVG, good for combo charts |
| Data fetching | TanStack Query (client) + server components | 5.x | Cache, refetch-on-interval for auto-refresh |
| Validation | Zod | 4.x | Env, API contracts, policy JSON |
| DB | PostgreSQL | 16 | `NUMERIC`, range types, exclusion constraints, partial indexes |
| Query layer | **Drizzle ORM** + drizzle-kit migrations, `pg` driver | 0.45.x | `numeric` returned as strings (no float leak), SQL-first aggregations, raw SQL for constraints; Prisma's `latest` tag currently points to an 8.0 RC (D-013) |
| Jobs / queue | **pg-boss** (Postgres-backed) | 12.x | Transactional enqueue, retries, cron, singleton keys; **no Redis needed** (D-014) |
| Auth | Better Auth (email+password, sessions in DB) | 1.7.x | Self-hosted, Drizzle adapter, org plugin |
| Money | decimal.js | 10.6 | Arbitrary-precision decimal |
| Dates | date-fns 4 + @date-fns/tz | | IANA-zone day boundaries |
| Logging | pino (JSON) | 10.x | Structured logs, redaction paths |
| Testing | Vitest (unit/integration), Playwright (E2E) | 5.x / 1.64 | |
| Lint/format | ESLint 10 + typescript-eslint, Prettier | | |

## 2. Repository layout

```
apps/
  web/            Next.js app: UI, route handlers (/api/*, /auth/*, /webhooks/*), server actions
  worker/         pg-boss worker process: sync jobs, recalculation, aggregation, reconciliation, cron
packages/
  config/         env schema (zod), shared tsconfig/eslint presets
  db/             Drizzle schema, migrations, typed repositories (tenant-scoped), seed + demo data
  finance/        PURE calculation engine (no I/O): policy, revenue, COGS, fees, shipping, metrics, trace
  shopify/        GraphQL client (cost-aware throttling), bulk ops, mappers → normalized facts, webhook HMAC
  google-ads/     OAuth helpers, REST searchStream client, GAQL queries, mappers
  core/           domain services (reporting service, data-source interface, demo adapter) used by web and worker
```

UI components and design tokens live in `apps/web/src/components` (D-025).

**Dependency rule:** `finance` depends on nothing internal. `shopify` and `google-ads` depend only on
`config`. `core` depends on db, finance and the integration packages. The apps depend on `core` and `ui`.
UI components never import `finance` directly; they receive computed results from `core` via the API.

## 3. Component & data flow

```
Shopify ──OAuth──> web /auth/shopify/callback ──> store_connection (encrypted tokens)
   │ webhooks (HMAC) ─> web /webhooks/shopify ─> webhook_event (dedupe by webhook id) ─> enqueue job
   │ bulk ops / GraphQL <── worker: shopify.backfill / shopify.incremental / shopify.reconcile
Google Ads ──OAuth──> web /auth/google/callback ──> ad_connection
   │ REST searchStream <── worker: ads.google.sync (daily + 3-day restatement window)
FX source <── worker: fx.daily (provider interface; ECB / openexchangerates)

worker pipeline per changed order:
  normalize facts → upsert (idempotent, by external GID + updated_at guard)
  → finance.computeOrderProfit(inputs, costs, policy) → order_profit (trace JSON) + order_daily_result + order_cogs_line
  → re-aggregate the touched (store, local_date) rows → daily_store_metrics
  (implemented in packages/core/src/profit: ProfitService; Phase 5)

web reads: daily_store_metrics + ad spend, expenses and new customers applied on read (D-034)
           → core.metrics.compute(range)
           → finance.metricRegistry → API JSON (money as strings) → UI
```

### Recalculation triggers
| Change | Recompute |
|---|---|
| Order created/updated/refunded/edited | that order → its affected dates |
| Variant cost version added/edited | orders containing the variant with order date in the version's range |
| Shipping/handling/fee rule changed | orders in the rule's effective range |
| Policy changed | all orders of the store (background job with progress) |
| Expense / ad spend changed | nothing (applied when reports are read, D-034) |

Each order result stores an `inputs_hash`, so recompute is skipped when nothing changed (idempotent).

## 4. Shopify ingestion design
- **App:** Dev Dashboard app, `embedded = false`, GraphQL Admin API pinned to `2026-10`
  (upgrade quarterly). Scopes: `read_orders, read_all_orders (when approved), read_products,
  read_inventory, read_customers, read_returns, read_shopify_payments_payouts,
  read_shopify_payments_disputes`.
- **Auth:** (M1 own stores: client credentials grant, see D-026.) For other merchants: authorization code grant with expiring offline tokens. Callback validation covers HMAC, `state`
  (random, single-use, bound to the user session, 10-minute TTL) and the shop domain regex. Tokens are
  stored encrypted, and the access token is refreshed before expiry (it lasts 60 minutes; the refresh
  token rotates). Multiple app credentials are supported (`shopify_app` table), so each owned store
  can use its own custom-distribution app (U1).
- **Backfill:** bulk operations in date windows (orders + line items + agreements/sales + refunds;
  a separate bulk job for transactions + fees; products/variants/inventory items). JSONL is
  streamed and parsed line by line, with parent linkage via `__parentId`. A cursor checkpoint per window
  makes the backfill resumable.
- **Incremental:** webhooks (`orders/create`, `orders/updated`, `orders/edited`, `orders/cancelled`,
  `refunds/create`, `order_transactions/create`, `products/create|update|delete`,
  `inventory_items/update`, `disputes/create|update`, `app/uninstalled`, plus the compliance topics). The
  webhook handler only verifies, dedupes and enqueues; the worker refetches the authoritative order by GID
  (payloads can be stale or out of order). A safety-net poll every 15 minutes queries `updated_at >= last_cursor − 5 min`.
- **Idempotency:** upserts keyed by `(store_id, shopify_gid)`, ignoring older `shopify_updated_at`.
  Child collections (line items, sales, transactions) are replaced per order inside one transaction.
- **Rate limits:** read `extensions.cost.throttleStatus`, sleep until enough points are available,
  exponential backoff with jitter on `THROTTLED`/5xx, max 8 attempts, then dead-letter.
- **Uninstall:** mark the connection revoked, stop jobs, keep data for 48 h, then honour `shop/redact` (purge).

## 5. Google Ads ingestion design
- Auth (D-041): a Google Cloud **service account** added as a read-only user in Google Ads (JWT bearer grant, scope
  `adwords`); key stored AES-256-GCM encrypted in `ad_connection.credentials_enc`. User OAuth (refresh tokens) for other
  merchants is Phase 9. Developer tokens no longer exist (sunset 2026-09-09); the Cloud project needs Explorer access.
- Account discovery: `customers:listAccessibleCustomers` → `customer` query; managers' children via `customer_client`
  (calls use `login-customer-id`) → the user maps accounts to stores.
- Sync: GAQL via `googleAds:searchStream` at **campaign** level with `segments.date`. Backfill 3 years in 90-day
  windows; every 6 hours re-read from the last synced date − 3 days (restatements). Each window is replaced atomically.
  Ad-group level arrives with Phase 7 analytics.
- Quotas: Explorer allows 2,880 operations/day; ProfitLens uses a few per account per run.
- Manual spend lives in per-store pseudo accounts (`manual:<store>:<platform>:<currency>`, account-level rows).

## 6. Security model
| Area | Control |
|---|---|
| Secrets | Only via env (validated by zod at boot), never `NEXT_PUBLIC_*` except non-secret config. Server-only modules marked `import "server-only"` |
| Token storage | AES-256-GCM envelope: `ENCRYPTION_KEYS` = JSON map `{kid: base64key}`, `ENCRYPTION_ACTIVE_KID`. Ciphertext format `v1:kid:iv:tag:data`. Rotation re-encrypts lazily on read + a background job |
| Sessions | Better Auth DB sessions, httpOnly + Secure + SameSite=Lax cookies, 30-day rolling, revoke on password change |
| CSRF | SameSite cookies + Origin header check on mutating route handlers; server actions are origin-checked by Next |
| OAuth | `state` + PKCE (Google), HMAC validation (Shopify), exact redirect URIs, shop-domain regex |
| Webhooks | HMAC-SHA256 over the **raw** body with `timingSafeEqual`; reject if > 5 min old (where a timestamp header exists); dedupe by webhook ID |
| Tenancy | Every query goes through repositories that **require** an `OrgScope` (`orgId` from the session membership); store IDs are always checked to belong to the scope. Integration tests assert cross-org access fails. Postgres RLS is deferred (documented risk; revisit before a public SaaS) |
| Authorization | Roles owner/admin/editor/viewer (M1 enforces owner/admin/viewer) checked in `core` services |
| PII minimisation | Customers stored as Shopify GID + country + first-order date + order count; no names, emails or addresses. Compliance webhooks handled |
| Audit | `audit_log` for cost edits, rule/policy/expense changes, connections, member changes |
| Logging | pino redaction of `authorization`, `cookie`, `*token*`, `*secret*`, query `code`/`hmac`/`state` |
| Data retention | Raw webhook payloads are not stored (hash only). Sync logs kept 30 days. On uninstall: purge after 48 h per `shop/redact` |
| Dependencies | Lockfile and `pnpm audit` in CI. Pinned versions |

## 7. Deployment architecture
- **One container image** with two process types: `web` (Next.js standalone server) and `worker` (pg-boss).
  Default target: **Railway** or **Fly.io** (two services from one image) + **managed Postgres 16**
  (Neon / Railway / Supabase). Redis isn't required.
- The public HTTPS URL is used for OAuth redirect URIs and webhook endpoints.
- Migrations run as a release step (`pnpm db:migrate`) before the new version takes traffic.
- Observability: JSON logs to the platform's log drain; error monitoring via an optional Sentry DSN; `/api/health` (DB + queue lag).
- Environments: `development` (local Postgres), `test` (ephemeral DB per test run), `production`.
- Implemented in Phase 9 (D-053): `Dockerfile` (roles `web`, `worker`, `migrate`, `cli`), `docker-compose.yml`,
  `/api/health`, worker heartbeat; operations guide in `docs/DEPLOYMENT.md`.

## 8. Roadmap (phases)
| Phase | Deliverables | External needs |
|---|---|---|
| 3 Frontend foundation | monorepo scaffold, design system, app shell, dashboard/report components, demo data adapter, auth screens | — |
| 4 Shopify | OAuth, backfill, webhooks, sync center, integration tests against fixtures + Luraflo | Dev Dashboard app + owner approval to install on Luraflo |
| 5 Finance engine | full §11 test matrix, recalculation, daily aggregation, reconciliation | — |
| 6 Google Ads | OAuth, account mapping, spend sync, manual fallback | Google Cloud project + OAuth client |
| 7 Advanced analytics | products, orders drawer, P&L (PDF/XLSX), ads profitability, comparisons, customers | — |
| 8 More integrations | Meta, TikTok (if access), multi-store consolidation | Meta app; TikTok app review |
| 9 Hardening | E2E, security review, a11y, perf (100k orders), deploy config, setup guide | Hosting accounts |

## 9. Database schema (implemented in `packages/db`)

Drizzle schema in `packages/db/src/schema/*.ts`. Migrations are in `packages/db/migrations/`:
`0000_init.sql` is generated, and `0001_integrity_constraints.sql` is hand-written (exclusion and check
constraints, partial unique index). Postgres 16 + the `btree_gist` extension.

| Domain | Tables | Key constraints |
|---|---|---|
| Auth (Better Auth) | `user`, `session`, `account`, `verification` | unique email / session token |
| Tenancy | `organization`, `membership` (role), `store` | `membership(org,user)` unique; `store.shop_domain` unique + shape check; currency `^[A-Z]{3}$`; `is_demo` flag |
| Connections | `shopify_app`, `store_connection`, `oauth_state`, `ad_connection` | tokens/secrets stored only as `*_enc` ciphertext; OAuth state stored as SHA-256 |
| Catalog & costs | `product`, `variant`, `variant_cost_version` | `(store, shopify_gid)` unique; **no overlapping cost periods per variant** (GiST exclusion on `daterange`); non-negative amounts |
| Orders | `customer` (PII-minimised), `order`, `order_line_item`, `sale_ledger_entry`, `refund`, `refund_line_item`, `payment_transaction`, `dispute`, `fulfillment` | every Shopify object unique on `(store_id, shopify_gid)`; ledger indexed by `(store, happened_local_date)` |
| Cost settings | `shipping_rule`, `handling_rule`, `gateway_fee_rule`, `order_cost_override`, `expense_category`, `expense`, `financial_policy` | interval checks; gateway rules can't overlap; expense fields validated per type; one active override per (order, component); policy `(store, version)` unique |
| Advertising | `ad_account`, `ad_campaign`, `ad_group`, `ad_spend_daily` | `(account, level, entity, date, source)` unique; API spend ≥ 0 |
| Results | `fx_rate`, `order_profit` (trace JSON, inputs hash, engine/policy version), `order_daily_result` (one order's contribution per local day), `order_cogs_line` (COGS per line and day, feeds the product report), `daily_store_metrics` (Σ order_daily_result) | `daily(store, local_date)` and `order_daily_result(order, local_date)` unique; ratios never stored |
| Operations | `sync_job`, `webhook_event`, `audit_log`, `reconciliation_issue` | `webhook_event(provider, external_id)` unique (dedupe) |

All money uses `NUMERIC(20,6)`, returned to Node as strings. FX rates use `NUMERIC(24,12)`.
