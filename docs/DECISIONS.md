# Decision Log

Format: ID · date · decision · rationale · status.

| ID | Date | Decision | Rationale | Status |
|---|---|---|---|---|
| D-001 | 2026-10-18 | Build for the owner's own stores first, multi-tenant schema from day one | Owner chose the default; avoids App Store review and `read_all_orders` public-app scrutiny while keeping a SaaS path | Accepted (owner) |
| D-002 | 2026-10-18 | First test store: Luraflo (live, AUD, Australia/Canberra) | Owner instruction | Accepted (owner) |
| D-003 | 2026-10-18 | TrueProfit connector used read-only as a functional reference | Owner authorized | Accepted (owner) |
| D-004 | 2026-10-18 | Release-1 ads: Google Ads + manual spend entry; Meta/TikTok later | Owner chose the default; Google is already used by Luraflo | Accepted (owner) |
| D-005 | 2026-10-18 | Code hosted on GitHub | Owner instruction | Accepted (owner), repo pending |
| D-006 | 2026-10-18 | Shopify: GraphQL Admin API only (pin a stable version, currently 2026-10), authorization code grant with **expiring offline tokens**, Dev Dashboard app with custom distribution per store for M1 | REST is legacy; admin-created custom apps are discontinued; expiring tokens are mandatory for public apps from 2027-01-01; custom distribution fits non-Plus owned stores | Accepted (Phase 2) |
| D-007 | 2026-10-18 | Google Ads via REST `googleAds:searchStream` (v26), no community SDK | No official Node library; the community lib lags versions | Accepted (Phase 2) |
| D-008 | 2026-10-18 | Decimal money + effective-dated costs + explicit completeness flags | TrueProfit evidence shows float money and silent $0 COGS; financial accuracy is priority #1 | Accepted (brief) |
| D-009 | 2026-10-18 | Original visual identity (light-first + dark mode), not TrueProfit's navy theme | Brief forbids reproducing brand identity | Proposed |
| D-010 | 2026-10-18 | Product name: **ProfitLens** | Owner decision | Accepted (owner) |
| D-011 | 2026-10-18 | Repo hygiene: no secrets or customer PII committed. (Repo made private by owner on 2026-10-18; TrueProfit reference screenshots restored under docs/research for internal reference only) | Owner decision | Accepted (updated) |
| D-012 | 2026-10-18 | TypeScript 6.0.x (not 7.x) | TS 7 (native) is too new for Next/ESLint tooling compatibility | Accepted |
| D-013 | 2026-10-18 | Drizzle ORM 0.45 + drizzle-kit instead of Prisma | `numeric` returned as strings (no float leak); SQL-first aggregation; raw SQL for exclusion constraints; Prisma's npm `latest` tag points to an 8.0 RC | Accepted |
| D-014 | 2026-10-18 | pg-boss (Postgres) for jobs instead of BullMQ/Redis | Transactional enqueue with data writes, cron, retries; one less infrastructure dependency at this scale | Accepted |
| D-015 | 2026-10-18 | Revenue from Shopify sales agreements (event-dated ledger); tax, duties and gift-card sales excluded from revenue by default; COGS from effective-dated landed cost at order date | Matches Shopify's own sales reports (reconcilable) and accounting treatment of liabilities | Accepted |
| D-016 | 2026-10-18 | Gross profit = Revenue − COGS (standard), with contribution profit before/after ads as separate metrics; break-even ROAS = 1 / contribution margin before ads | Standard definitions; avoids TrueProfit's mixed gross-profit definition | Accepted |
| D-017 | 2026-10-18 | Tenant isolation enforced in the application layer (OrgScope required by all repositories); Postgres RLS deferred | Simpler for M1; tested; revisit before public SaaS | Accepted (risk noted) |
| D-018 | 2026-10-18 | Customer PII minimised (Shopify GID, country, first-order date, order count only) | Least data needed for LTV/cohorts; reduces protected-customer-data obligations | Accepted |
| D-019 | 2026-10-18 | Deploy as one container image with web + worker processes on Railway/Fly + managed Postgres | Simplest production topology; no Redis | Proposed (confirm in Phase 9) |
| D-020 | 2026-10-18 | Monorepo uses `moduleResolution: Bundler` and extensionless relative imports | Turbopack cannot resolve `.js`-suffixed imports of workspace TS sources; vitest/tsx handle bundler resolution; the worker will be bundled | Accepted |
| D-021 | 2026-10-18 | Auth rate limits: 5 sign-ups and 10 sign-ins per minute per IP (Better Auth, in-memory store) | Brute-force protection; move to a shared store when scaling beyond one instance | Accepted |
| D-022 | 2026-10-18 | Demo store is served from an in-memory deterministic generator (never written to the DB), always bannered | Guarantees demo data can never mix with live data | Accepted |
| D-023 | 2026-10-18 | Dashboard card selection stored per browser (localStorage) in M1 | Low-risk preference; moves to user settings in DB later | Accepted |
| D-024 | 2026-10-18 | No dual-axis charts: net margin has its own chart; revenue/costs/profit share one currency axis | Data-viz rule (dual axes mislead) | Accepted |
| D-025 | 2026-10-18 | UI components live in `apps/web/src/components/ui` (hand-written on Radix, shadcn-style) rather than `packages/ui` | Single app consumer; shadcn registry blocked in dev container | Accepted |
