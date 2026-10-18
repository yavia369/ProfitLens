# Project Status

_Last updated: 2026-10-18_

## Current phase
**Phase 2 — Architecture & Database: IN PROGRESS** (Phase 1 accepted by owner 2026-10-18).

## Completed
- REA installed for Claude Code (v6.7.0) and verified (MCP tools listed; CLI used for long runs).
- TrueProfit investigation (see `docs/research/`):
  - feature inventory, UI analysis, user flows, technical findings, parity matrix;
  - raw cited notes: help centre (128 articles), product updates/solution pages (32 pages),
    Shopify / Google Ads / Meta / TikTok API research;
  - TrueProfit connector schema evidence from the Luraflo store (read-only);
  - REA network capture + screenshot of the public site.
- Product requirements, MVP priorities, technical unknowns: `docs/PRODUCT_REQUIREMENTS.md`.

## In progress
- None.

## Pending (by phase)
- Phase 2: stack selection, architecture, DB schema, financial calculation spec, integration
  strategy, security model, deployment architecture, roadmap.
- Phases 3–9 as per the master brief.

## Known bugs
- None (no code yet).

## External blockers / owner actions
| # | Item | Needed by |
|---|---|---|
| B1 | ~~GitHub repo~~ RESOLVED: `yavia369/ProfitLens` (public). TrueProfit images and raw REA captures are deliberately not committed. | — |
| B2 | Network: Shopify + Google hosts now allowed (verified 2026-10-18). Still blocked: FX-rate hosts (openexchangerates.org, ECB, frankfurter), `app.trueprofit.io`, `be.trueprofit.io`, `developers.facebook.com` | FX needed for multi-currency tests against live rates (Phase 5+) |
| B3 | Shopify: approval to create a Dev Dashboard app and install it (read-only scopes) on Luraflo; `read_all_orders` request | Phase 4 |
| B4 | Google Cloud project + OAuth client (Google Ads API access level Explorer/Basic) | Phase 6 |
| B5 | Hosting accounts (Postgres, Redis, app host) | Phase 9 |

## Next tasks (after approval)
1. Phase 2 architecture docs + Prisma schema + financial model spec.

## Test results
- No code yet.
