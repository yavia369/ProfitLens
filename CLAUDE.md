# CLAUDE.md — ProfitLens

Shopify profit-analytics app, independently built with TrueProfit as a **functional** reference.
Never copy TrueProfit code, branding, logos or assets.

## Start here (every session)
1. Read `docs/PROJECT_STATUS.md`: current phase, what's done, blockers, next tasks.
2. Read `docs/DECISIONS.md` before changing architecture or financial policy.
3. Phase gate: finish the current phase, report, and **wait for owner approval** before starting the next one.

## Commands
- `pnpm install` · `pnpm typecheck` · `pnpm test` (Postgres 16 needed for `@profitlens/db` tests: `TEST_DATABASE_URL`)
- `pnpm db:migrate` (uses `DATABASE_URL`) · `pnpm --filter @profitlens/db db:generate` after schema changes
- Web: `cd apps/web && cp ../../.env.example .env.local` (fill values) → `npx next build && npx next start`
- E2E: app running on :3000, then `pnpm --filter @profitlens/web e2e` (Chromium at /opt/pw-browsers here)
- Local Postgres in this container: `pg_ctlcluster 16 main start` (role/db `profitlens`/`profitlens`, test db `profitlens_test`)

## Key docs
- `docs/PRODUCT_REQUIREMENTS.md`: scope, milestones (M1/M2/M3), product rules, unknowns.
- `docs/research/`: TrueProfit investigation (feature inventory, UI, flows, technical findings,
  parity matrix). Raw notes with citations live in `docs/research/_raw/`.
- `docs/ARCHITECTURE.md`, `docs/FINANCIAL_MODEL.md`, `docs/INTEGRATIONS.md`, `docs/TESTING.md`,
  `docs/FEATURE_PARITY.md`: filled in from Phase 2 onward.

## Non-negotiables
- Financial accuracy first: decimal money only (no JS `number` for money), effective-dated
  costs, idempotent sync, unknown costs are never silently 0, every figure traceable.
- No financial calculations in UI components; they belong in the calculation engine package.
- Demo data must be flagged and bannered; it is never mixed with live store data.
- Never put tokens or secrets in frontend bundles or commit them. Use env validation.
- Don't claim a feature works without code plus passing tests. Mark external blockers explicitly.
- Evidence labels in research docs: VERIFIED / DOCUMENTED / INFERRED / UNKNOWN.

## Environment notes
- Cloud container is ephemeral. Commit and push to GitHub: `yavia369/ProfitLens` (private repo since 2026-10-18;
  still never commit secrets or customer PII). TrueProfit reference screenshots live in `docs/research/screenshots/`
  for internal reference only — never use them as app assets.
- REA (reverse-engineering MCP) is installed; its MCP calls time out at 60 s here, so use the CLI:
  `npx -y rea-agents@6.7.0 <command> <json>`. A headless Chromium with CDP can be launched with
  `--proxy-server=$HTTPS_PROXY` (launch-mode REA scenarios don't use the proxy; connect mode does).
- Connected MCP connectors: TrueProfit (read-only reference, owner-authorized), Shopify (Luraflo store).
- Live store Luraflo (AUD, Australia/Canberra). Read-only scopes only.
  Installing our app on it requires explicit owner approval.
