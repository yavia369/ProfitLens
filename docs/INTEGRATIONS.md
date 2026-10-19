# Integrations

Phase 1 research summary. Full cited notes are in `docs/research/_raw/api-notes.md`. The detailed
integration design will be added in Phase 2.

## Shopify (verified against shopify.dev, 2026-10-18)
- **API:** use only the GraphQL Admin API. Pin the latest stable version, **2026-10** (2026-01, 2026-04 and 2026-07 are still supported; 2025-10 retired 2026-10-16). REST has been legacy since 2024-10.
- **App type:** a Dev Dashboard app. Admin-created custom apps can no longer be created.
  - Custom distribution covers 1 store, or several stores in one Plus organization.
  - Public distribution needs an embedded experience before an App Store listing.
- **Auth:** authorization code grant with **expiring offline tokens**.
  - The access token lasts 1 hour; the refresh token lasts 90 days and rotates.
  - Expiring tokens are mandatory for public apps from 2027-01-01.
  - The client credentials grant (24-hour tokens) works only for stores in the same Dev Dashboard organization.
- **Scopes:**
  - `read_orders` reaches 60 days only. `read_all_orders` covers older orders and needs Shopify approval (U2).
  - `unitCost` comes with `read_inventory` or `read_products`.
  - Fees need `read_shopify_payments_payouts`; disputes need `read_shopify_payments_disputes`.
- **Bulk operations:**
  - Up to 5 can run concurrently (2026-01 and later). Each allows at most 5 connections nested 2 levels deep.
  - Results come as JSONL linked by `__parentId`. Download URLs expire after 7 days.
- **Webhooks:**
  - Verify the HMAC on the raw body.
  - Delivery is at-least-once and unordered; dedupe on `X-Shopify-Webhook-Id`. Shopify retries 8 times over 4 hours.
  - Reconciliation jobs are required.
  - The mandatory compliance topics are `customers/data_request`, `customers/redact` and `shop/redact`.
- **Rate limits:**
  - Leaky-bucket cost points: 100, 200, 1,000 or 2,000 per second depending on plan. A single query costs at most 1,000 points.
  - Pages hold at most 250 items. Cursor pagination stops at 25,000 objects, so use date windows or bulk operations.
- **Profit fields:**
  - Transaction `fees` exist for Shopify Payments only.
  - Order **agreements/sales** give event-dated revenue changes.
  - `unitCost` is current-only, so snapshot it on import.

## Google Ads (verified against developers.google.com, 2026-10-18)
- **API version:** v26, released 2026-10-14. **Developer tokens were sunset on 2026-09-09.** Access levels now attach to the Google Cloud project that owns the OAuth client.

  | Level | Accounts | Daily operations | How to get it |
  |---|---|---|---|
  | Test | Test accounts only | 15,000 | Automatic |
  | Explorer | Production too | 2,880 | Auto-granted |
  | Basic | Production too | 15,000 | Brand verification |
  | Standard | Production too | Unlimited | About 10 business days of review |

- **OAuth:**
  - The scope is `https://www.googleapis.com/auth/adwords`, which is sensitive and needs verification for external users.
  - While the consent screen is in "Testing" mode, refresh tokens expire after 7 days.
  - Send the `login-customer-id` header when access goes through a manager account.
- **Spend query:** GAQL with `metrics.cost_micros` and `segments.date`. Dates are in the account's time zone (`customer.time_zone`); the currency is `customer.currency_code`.
- **Client:** use REST `googleAds:searchStream`. There's no official Node SDK.

## Meta / TikTok (unverified; primary docs blocked)
- **Meta:** Graph/Marketing API v26.0. `ads_read` with Standard Access is enough for your own ad accounts; other merchants' accounts need Advanced Access through App Review. Daily spend comes from `/act_{id}/insights?level=campaign&time_increment=1`.
- **TikTok:** Marketing API v1.3 (reported). Requires a developer app, app review and authorization from each advertiser.

## Shopify implementation (Phase 4)
| Piece | Where | Notes |
|---|---|---|
| Admin GraphQL client | `packages/shopify/src/client.ts` | cost-based throttling from `extensions.cost`, retries on 429/5xx/THROTTLED, typed errors |
| Auth | `packages/shopify/src/auth.ts`, `packages/core/src/shopify/connection.ts` | client credentials grant (D-026); client secret and access token stored AES-256-GCM encrypted with per-record context; token refreshed 5 min before expiry |
| Scopes | `REQUIRED_SCOPES` | `read_orders, read_products, read_inventory, read_customers, read_returns, read_shopify_payments_payouts, read_shopify_payments_disputes`; `read_all_orders` optional (without it history is limited to 60 days and the UI says so) |
| Backfill | `ShopifySyncService.backfill` | bulk operations for products (variants + inventory item unit cost) and orders (line items, agreements→sales, refunds, transactions with fees). Bulk cannot select a connection inside a list field, so refunds come without refund line items; refunded orders are refetched with the paged `OrderById` query (D-031) |
| Disputes | `syncDisputes` | top-level `disputes` query (covered by `read_shopify_payments_disputes`); `shopifyPaymentsAccount.disputes` would also need `read_shopify_payments_accounts` (D-032) |
| Incremental | `ShopifySyncService.incremental` | paged `updated_at` queries with a 5-min overlap; checkpoint `orders_synced_through` |
| Idempotency | `packages/core/src/shopify/upsert.ts` | upserts by Shopify GID; an older `updatedAt` never overwrites a newer one; child rows replaced atomically per order |
| Costs | `syncShopifyCostVersion` | Shopify `unitCost` snapshot becomes an effective-dated cost version (source `shopify`); manual versions are never touched; variants without a cost stay "missing" (never 0) |
| Webhooks | `apps/web/src/app/api/webhooks/shopify/route.ts` → `handleShopifyWebhook` | HMAC on raw body, dedupe on webhook id, payload treated as a hint (authoritative re-fetch), compliance topics handled. Not reachable until deployed (D-029) |
| Reconciliation | `reconcileOrderCounts` | Shopify `ordersCount` vs ours per store-local day; mismatches recorded as `reconciliation_issue` |
| Worker | `apps/worker` | pg-boss queues and crons (D-027); CLI `pnpm --filter @profitlens/worker sync <connect|backfill|incremental|reconcile|status>` |

### Live verification on Luraflo (2026-10-19)
Connected with the store-owned Dev Dashboard app (client credentials). Granted scopes: the 7 required, no
`read_all_orders`. Backfill imported 32 orders, 42 line items, 77 sales-ledger entries, 1 refund (1 refund line),
33 payment transactions, 1 dispute, 235 products, 7,817 variants. Cross-checked with the Shopify connector
(independent auth) and ShopifyQL:

| Check | Result |
|---|---|
| Order count per store-local day, 2026-10-05 → 10-18 (ShopifyQL `FROM sales SHOW orders`) | VERIFIED: identical on all 11 days (32 orders) |
| `ordersCount` parity (`sync reconcile`, 30 days) | VERIFIED: 0 mismatches |
| Gross sales and discounts per day (order subtotal + discounts vs ShopifyQL) | VERIFIED: identical on all days |
| Net sales (sales ledger total vs ShopifyQL `net_sales`) | VERIFIED: 2,245.43 AUD both; refund of #1002 (created 2026-10-14 16:46 UTC) dated 2026-10-15 in Australia/Canberra by both |
| Sample order #1002: refund line, restock type, fees | VERIFIED: qty 1, NO_RESTOCK, 35.99; SALE fee 2.36 = 1.83 processing + 0.53 foreign exchange; REFUND has no fee data (stored as unknown, not 0) |
| Product unit costs | VERIFIED: Luraflo has no unit costs in Shopify (sampled `unitCost: null`); 0 of 7,817 variants have a cost, so all COGS will show as missing until costs are entered (Phase 5) |
| `SalesAgreement` / `Sale` GID formats in bulk output | VERIFIED: every agreement (order and refund) is `gid://shopify/SalesAgreement/N`, every sale `gid://shopify/Sale/N`; assembler handles both |
| `read_all_orders` | Not requested on the app. Without it, Shopify's all-time count is 33 vs 32 visible: #1001 (2026-07-27, USD 0.99) is outside the 60-day window. Whether a Dev Dashboard app can be granted it remains UNKNOWN |
| Tax-inclusive AUD amounts | UNKNOWN (not testable on Luraflo): `taxesIncluded: false` and no tax charged on any order |
| Bugs found and fixed by the live run | Bulk query rejected (connection inside the `refunds` list, D-031); disputes access denied via `shopifyPaymentsAccount` (D-032) |

## Integration strategy (Phase 2 decisions)
Design details are in `ARCHITECTURE.md` §4 (Shopify) and §5 (Google Ads).

| Integration | M1 approach | Owner prerequisites | Blocked until |
|---|---|---|---|
| Shopify | Dev Dashboard app (custom distribution) installed on Luraflo; client credentials grant for own stores (D-026), auth code grant + expiring offline tokens for other merchants later; bulk backfill + webhooks + 15-min safety poll + nightly reconciliation | Create the app in Shopify Dev Dashboard (or let us guide it); approve install on Luraflo; request `read_all_orders` | Phase 4 approval |
| Google Ads | REST v26 searchStream; OAuth web client in the owner's Google Cloud project; Explorer access (auto) | Google Cloud project, OAuth consent screen (published), OAuth client ID/secret, redirect URI on the deployed domain | Phase 6 |
| Manual ad spend | Always available (`ad_spend_daily.source = manual`) | — | — |
| FX rates | Provider interface; default ECB daily reference rates (no key), fallback openexchangerates (key) | Allow the FX host on the network (blocked in this dev container) | Multi-currency live data |
| Meta / TikTok | Phase 8 | Meta app (Standard Access for own ad accounts) / TikTok app review | Phase 8 |
