# Deployment

ProfitLens ships as **one Docker image** with three roles (ARCHITECTURE §7, D-019, D-053):

| Role | Command | What it does |
|---|---|---|
| `migrate` | `docker run … profitlens migrate` | Applies database migrations (idempotent). Run as the release step before new web/worker processes start. |
| `web` | `… profitlens web` (default) | Next.js standalone server on `PORT` (3000). Health: `GET /api/health`. |
| `worker` | `… profitlens worker` | pg-boss jobs and schedules: Shopify sync (15 min), ad spend (6 h), processor fees (6 h), ECB rates (daily), nightly reconciliation. Run **exactly one** worker process (schedules are idempotent, but one is enough). |
| `cli` | `… profitlens cli <command>` | Operator CLI (same commands as `pnpm --filter @profitlens/worker sync …`, see `apps/worker/src/cli.ts`). |

Verified on 2026-10-19 in this repository's container: the image builds, `migrate` → `web` + `worker` come up
healthy on a fresh database, the full Playwright suite (12/12) passes against the containerised web server, and
`docker-compose.yml` brings up Postgres + migrate + web + worker with all health checks green. CI builds the image
and smoke-tests the three roles on every push (`.github/workflows/ci.yml`, job `image`).

## Environment variables
Set these in the hosting platform's secret/env settings. Never commit them, never put them in `NEXT_PUBLIC_*`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres 16 connection string (managed Postgres recommended; enable TLS with `?sslmode=require` if the provider needs it). |
| `APP_URL` | yes | Public HTTPS address, e.g. `https://profit.example.com` (sign-in cookies, links, Shopify webhook endpoint). |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random characters: `openssl rand -hex 32`. Rotating it signs everyone out. |
| `ENCRYPTION_KEYS` | yes | JSON map of key id → base64 32-byte key, e.g. `{"k2026":"<openssl rand -base64 32>"}`. Encrypts every stored token/secret. **Keep old keys when rotating** (add a new id, switch `ENCRYPTION_ACTIVE_KID`). Losing all keys means reconnecting every integration. |
| `ENCRYPTION_ACTIVE_KID` | yes | The key id used for new encryptions. |
| `SHOPIFY_API_VERSION` | no | Default `2026-10`. |
| `LOG_LEVEL` | no | Default `info`. Logs are JSON on stdout (secrets redacted). |
| `ERROR_REPORT_URL` | no | Server errors are always logged as JSON with the request id; when set, a short report (message, path, route, request id, no headers or bodies) is also POSTed here (e.g. an incident or chat webhook). |
| `APP_VERSION` | build arg | Set automatically from the build (`--build-arg APP_VERSION=$(git rev-parse --short HEAD)`); shown in logs and the worker heartbeat. |

Integration credentials (Shopify client secret, Google key, Meta token, Stripe/PayPal keys) are entered in
**Settings → Stores & integrations** and stored encrypted in the database; they are not environment variables in
production (the `SHOPIFY_*`, `GOOGLE_ADS_*`, `META_*`, `STRIPE_*`, `PAYPAL_*` variables in `.env.example` are only
for the operator CLI).

## Health checks
- `GET /api/health` → 200 while the database answers; the JSON body reports `worker` (heartbeat age) and `queue`
  (oldest due job, failures in 24 h). Use it as the platform health check for the **web** process.
- `GET /api/health?strict=1` → 503 when the worker is down (no heartbeat for 5 min) or jobs wait > 15 min. Use
  it for an external uptime monitor.
- The image's Docker `HEALTHCHECK` is role-aware (web: `/api/health`; worker: its heartbeat file).

## Option A — any Docker host (docker compose)
```sh
# .env next to docker-compose.yml (never committed): POSTGRES_PASSWORD, APP_URL, BETTER_AUTH_SECRET,
# ENCRYPTION_KEYS, ENCRYPTION_ACTIVE_KID (optional: WEB_PORT, LOG_LEVEL)
docker compose up -d --build
```
Put an HTTPS reverse proxy (Caddy, nginx, the platform's load balancer) in front of port 3000 and back up the
`pgdata` volume (or use managed Postgres and drop the `db` service).

## Option B — a container platform (Railway, Fly.io, Render, …)
The platform docs could not be read from the development container (hosts blocked), so this mapping is INFERRED and
is confirmed once the owner chooses a host (B5):
1. Create a managed Postgres 16 database; copy its URL into `DATABASE_URL`.
2. Create two services from this repository's `Dockerfile`: **web** (start command `web`, public HTTP port 3000,
   health check path `/api/health`) and **worker** (start command `worker`, no public port, 1 instance).
3. Set the release / pre-deploy command to `migrate` (on platforms without one, run
   `docker run … profitlens migrate` before each deploy).
4. Set the environment variables above on both services (same values).
5. Point a domain with HTTPS at the web service and set `APP_URL` to it.

## After the first deploy
1. Open `APP_URL`, sign up (the first account owns its workspace), connect the store (Settings → Stores).
2. **Shopify webhooks** (changes arrive in seconds instead of up to 15 minutes; the poll keeps running as a safety
   net): `… profitlens cli webhooks-register <storeId>` subscribes the 16 order/product/dispute/uninstall topics at
   `APP_URL/api/webhooks/shopify`. It is idempotent and moves subscriptions when the domain changes. This creates
   webhook subscriptions on the live store, so it needs the owner's go-ahead.
3. **Compliance webhooks** (customers/data_request, customers/redact, shop/redact) cannot be created through the
   API: set `APP_URL/api/webhooks/shopify` as the compliance webhook URL in the app's configuration in the Shopify
   Dev Dashboard (new app version → release). The handler already processes all three.
4. In the Dev Dashboard, set the app version's **Webhooks API Version** to the same version as
   `SHOPIFY_API_VERSION` (DOCUMENTED: Apps → your app → Versions → Create a version → Webhooks API Version → Release).
5. Check `GET /api/health?strict=1` returns 200 and the Sync Center shows the store syncing.

## Backups and rollback
- Use the Postgres provider's daily backups with point-in-time recovery. All money and history live in Postgres;
  the containers are stateless.
- Migrations only add (Phases 2–9); rolling back the app image is safe as long as no later migration dropped a
  column. Never edit an applied migration.
