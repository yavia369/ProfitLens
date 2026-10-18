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
