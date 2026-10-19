# Security review (Phase 9, 2026-10-19)

Scope: the whole repository at the Phase 9 commit — web app (Next.js 16), worker, core/db packages, integrations,
Docker image. Method: code review of every entry point, dependency audit, client-bundle scan, header inspection
against the running production build, automated tests. Labels: **Fixed** (changed in Phase 9, tested),
**OK** (verified, no change needed), **Accepted** (known, reasoned, documented), **Before SaaS** (needed before
ProfitLens serves merchants other than the owner).

## Summary
| # | Area | Finding | Status |
|---|---|---|---|
| 1 | HTTP headers | No Content-Security-Policy or HSTS | **Fixed**: nonce-based CSP per request (`apps/web/src/proxy.ts`: scripts only from self or with the nonce, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`), HSTS 1 year. The a11y e2e test fails on any CSP violation across all pages. Inline *style attributes* stay allowed (charts render them; low risk) |
| 2 | Dependencies | `pnpm audit --prod`: `uuid` < 11.1.1 (via exceljs) | **Fixed**: pnpm override to 11.1.1 (exceljs only calls `v4`, the advisory concerns v3/v5/v6; Excel export round-trip test passes) |
| 3 | Dependencies | `esbuild` ≤ 0.24.2 via better-auth → drizzle-kit → @esbuild-kit (GHSA-67mh-4wv8-2f99, dev-server CORS) | **Accepted**: only affects esbuild's development server, which nothing here runs; not in the production image's code path. Re-check when better-auth updates |
| 4 | Client bundles | Secrets in browser JavaScript | **OK**: scan of `.next/static` for the values of every secret variable and for key/token patterns (postgres URLs, private keys, `sk_/rk_live_`, `shpss_`, `shpat_`, `EAAB…`) found none. Only the name `BETTER_AUTH_SECRET` appears (better-auth's env accessor; no value) |
| 5 | Authentication | Every server action and route handler | **OK**: all 32 server actions call `requireAppSession` (or the auth session for accepting an invitation); all report/export/store API routes go through `reportContext`/`getAppSession`. Unauthenticated by design: `/api/auth/*` (Better Auth), `/api/health` (no tenant data), `/api/webhooks/shopify` (HMAC-SHA256 over the raw body, constant-time compare, dedupe) |
| 6 | Authorisation | Role checks | **OK**: core services assert roles (viewer < editor < admin < owner); covered by integration tests (viewer rejections, owner-only role grants, last-owner guard under row locks) |
| 7 | Tenancy | Cross-organisation access | **OK** in the application layer: every repository requires an `OrgScope` and checks store/connection ownership; integration tests assert another organisation gets nothing (reports, customers, UTM, campaigns, payment connections, ad accounts). Postgres RLS is not enabled — **Before SaaS** (D-054) |
| 8 | SQL injection | Query construction | **OK**: Drizzle parameterised queries throughout; the two `sql.raw`/`sql.identifier` uses take compile-time constants only (`upsert.ts` column names, Sync Center table names) |
| 9 | Secrets at rest | Integration credentials | **OK**: AES-256-GCM with per-record context (AAD) and key rotation (`ENCRYPTION_KEYS`/`ENCRYPTION_ACTIVE_KID`); Meta tokens only in the Authorization header, never in URLs; worker logs redact token/secret/key fields (pino) |
| 10 | Sessions & CSRF | Cookies, cross-site requests | **OK**: Better Auth httpOnly cookies, `Secure` in production, SameSite=Lax; server actions are origin-checked by Next.js; route handlers that change state are only Better Auth's and the HMAC webhook |
| 11 | Redirects | Open redirect after sign-in | **OK**: `safe-next.ts` accepts only relative invite paths (Phase 7) |
| 12 | Brute force | Sign-in / sign-up | **Accepted**: Better Auth rate limits (5 sign-ups, 10 sign-ins per minute per IP) use in-memory storage, correct for the single web instance in D-053; move to a shared store before running several web instances (D-021) |
| 13 | Container | Image hardening | **OK**: runs as the non-root `node` user, no secrets in layers (env at run time; the optional build CA is a BuildKit secret mount), no TypeScript tooling at runtime |
| 14 | PII | Customer data | **OK**: customers stored as Shopify GID, country, first-order date and order count only; compliance webhooks (data request, customer redact, shop redact) handled and audited |
| 15 | Health endpoint | Information exposure | **Accepted**: `/api/health` returns database latency, worker heartbeat age and queue counts; no tenant, store or credential data |

## Not covered / follow-ups
- No external penetration test; no dynamic scanner run against a deployed URL (none exists yet, B5).
- Postgres RLS as defence in depth (D-054) and a shared rate-limit store (D-021) before multi-merchant use.
- Email-based account recovery and MFA are not built (Better Auth supports both; product decision).
