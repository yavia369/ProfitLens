# ProfitLens

Shopify profit analytics with auditable, decimal-accurate calculations: revenue, COGS, shipping,
fees, chargebacks, ad spend and expenses, aggregated into net profit per store, order, product and channel.

> Status: under active development (see `docs/PROJECT_STATUS.md`). Not production-ready.

## Repository
- `docs/`: product requirements, architecture, financial model, integrations, testing, decisions.
- `packages/db`: PostgreSQL schema (Drizzle), migrations and integration tests.
- `packages/config`: validated server environment.

## Local development
Requirements: Node 22.19+, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env            # fill in values; never commit .env
pnpm db:migrate                 # applies packages/db/migrations to DATABASE_URL
pnpm --filter @profitlens/db test   # uses TEST_DATABASE_URL (schema is dropped and recreated)
```
