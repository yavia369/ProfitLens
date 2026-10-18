# API research notes: Shopify profit-analytics app

Researched 2026-10-18. Sources are official developer docs fetched that day: shopify.dev markdown endpoints (`<url>.md`) and developers.google.com HTML. Every fact has a URL. **Unverified / inferred** marks anything not confirmed in an official source.

Access limitations during this research:
- developers.facebook.com, help.shopify.com, community.shopify.dev, business-api.tiktok.com and support.google.com were blocked by the egress proxy, and WebFetch could not resolve them either.
- The Meta and TikTok sections therefore rely on web-search snippets of official pages plus some third-party pages. Check them by hand before relying on them.

---

## SHOPIFY

### 1. API versions, release schedule, REST status

- Shopify releases a new API version every quarter, at 5pm UTC on the first day of the quarter. Each stable version is supported for at least 12 months, with at least 9 months of overlap. https://shopify.dev/docs/api/usage/versioning
- Version table as published (https://shopify.dev/docs/api/usage/versioning):

  | Version | Released | Accessible until | Status |
  |---|---|---|---|
  | 2025-10 | Oct 1 2025 | Oct 16 2026 15:00 UTC | **Unsupported** (retired 2 days ago) |
  | 2026-01 | Jan 1 2026 | Jan 16 2027 | Stable |
  | 2026-04 | Apr 1 2026 | Apr 16 2027 | Stable |
  | 2026-07 | Jul 1 2026 | Jul 16 2027 | Stable |
  | **2026-10** | Oct 1 2026 | Oct 16 2027 | **Latest stable** |
  | 2027-01 | Jan 1 2027 | Jan 16 2028 | Release candidate |

- If a request targets a version that is no longer accessible, Shopify "falls forward" to the oldest accessible stable version. The `X-Shopify-API-Version` response header shows which version actually served the request. Webhook payloads are versioned the same way. https://shopify.dev/docs/api/usage/versioning
- Apps that keep using unsupported resources are delisted from the App Store, and merchants are blocked from installing them for at least 7 days. https://shopify.dev/docs/api/usage/versioning
- **REST Admin API is legacy:** "The REST Admin API is a legacy API as of October 1, 2024. Starting April 1, 2025, all new public apps must be built exclusively with the GraphQL Admin API." https://shopify.dev/docs/api/admin-rest
  - Decision: use GraphQL Admin API only.

### 2. App distribution and auth (2026)

**Distribution methods** (https://shopify.dev/docs/apps/launch/distribution):

| Method | Stores | Auth | Approval | Notes |
|---|---|---|---|---|
| Public | Many | Token exchange if embedded; authorization code grant if not | App Store review | Can use Shopify Billing |
| Custom | One store, OR many stores in the **same Plus organization**, OR dev stores | Token exchange if embedded; authorization code grant if not | None | Can't use Shopify Billing |
| Shopify admin (admin-created custom app) | One store | Pre-generated token | None | "**no longer available for new apps** … Can't be created anymore, though existing apps keep working" |

- The distribution method can't be changed after it is selected. https://shopify.dev/docs/apps/launch/distribution
- Custom-distribution multi-store installs work only for stores in one Plus organization. Apps created before 2023-07-26 need Shopify Support to enable this. https://shopify.dev/docs/apps/launch/distribution/select-distribution-method
- The **Distribution** card appears only for apps that belong to a Partner organization. Apps created in a store's own organization are installed from the **Installs** card instead. https://shopify.dev/docs/apps/launch/distribution/select-distribution-method

**Admin-created custom apps discontinued**
- Official wording: "You can no longer create new admin-created custom apps. Existing apps are unaffected and continue to work. For new apps, use Dev Dashboard or Shopify CLI." https://shopify.dev/docs/apps/build/authentication-authorization/legacy/admin-custom-apps
- **Exact cutoff date:** shopify.dev doesn't state one. Third-party sources say **January 1, 2026** (e.g. https://cartcoders.com/blog/shopify-apps/shopify-custom-apps-after-january-1year-dev-dashboard-and-legacy-app-guide/, https://www.deployhq.com/support/servers/adding-a-server/shopify/creating-a-custom-shopify-app.md). Some older stores reportedly still show a "Create a legacy custom app" option (https://docs.villatheme.com/configuration/how-to-use-11/create-an-app-and-get-credentials/). Treat the date as **unverified-official**.
- **Replacement: Dev Dashboard** (https://dev.shopify.com/dashboard/).
  - Create an app there ("Best for automation or API-only apps with no UI in the Shopify admin") or with Shopify CLI ("recommended path for feature-rich, extensible apps"). https://shopify.dev/docs/apps/build/dev-dashboard
  - In a Dev Dashboard app you create a **version** (App URL, webhooks API version, scopes) and release it. A non-embedded app can use the default App URL `https://shopify.dev/apps/default-app-home`. https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard

**Grants and token types** (https://shopify.dev/docs/apps/build/authentication-authorization, https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)

All grants use the same token endpoint: `POST https://{shop}.myshopify.com/admin/oauth/access_token`.

| Grant | When to use | Notes |
|---|---|---|
| Token exchange | Embedded apps | Swaps an App Bridge ID token for an access token. `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`; `expiring=1` gives an expiring offline token. |
| Authorization code grant | Apps that run **outside** the Shopify admin (standalone / API-only) | Redirect to `https://{shop}.myshopify.com/admin/oauth/authorize` with `client_id`, `scope`, `redirect_uri`, `state`. Verify `state`, the HMAC (constant-time compare) and the shop regex `^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$`, then exchange the code with `expiring=1`. https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps |
| Client credentials grant | Server-side integration acting only on stores **in your own Shopify organization** | `grant_type=client_credentials`; token lasts 24h (`expires_in` 86399); refresh by repeating the request. Fails with `shop_not_permitted` if the store isn't in the same Dev Dashboard org. "Owning a store or having it installed doesn't automatically place it in your org." Can't reach a client's store. https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant |

Token lifetimes (https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens):

| Token | Lifetime |
|---|---|
| Expiring offline token | **1h** (`expires_in` 3600) |
| Refresh token for it | 90 days when issued (`refresh_token_expires_in` 7776000) |
| Non-expiring offline token | Until uninstall or secret revocation |
| Online token | 24h, or until the user logs out |
| Client-credentials token | 24h |
| Delegate token | Prefix `shppa_`; inherits the parent token's lifetime |

- Offline and online tokens both start with `shpat_`.
- **Refresh rotation:** every refresh returns a new access token and a new refresh token.
  - The refresh token you presented stays usable until the earliest of: you use the new one; a new token is acquired; 30 days after its first use; or its original 90-day expiry.
  - Don't run "acquire" (token exchange or code grant) and "refresh" at the same time for one store: each retires the other's result.
  - Changelog 2026-08-28: https://shopify.dev/changelog/more-resilient-refreshes-for-expiring-offline-access-tokens
- **Non-expiring offline tokens are being phased out for public apps:**
  - New public apps created on or after **April 1, 2026** must use expiring tokens. https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-public-apps-april-1-2026
  - **All** public apps must use them from **January 1, 2027**. After that, GraphQL Admin requests that present a non-expiring token are rejected. https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027, https://shopify.dev/docs/apps/build/authentication-authorization/migrate-to-expiring-offline-access-tokens
  - **Not affected:** custom apps, and apps created by merchants in the Dev Dashboard or in the admin (same sources).
  - Expiring offline tokens were first introduced on 2025-12-10. https://shopify.dev/changelog/offline-access-tokens-now-support-expiry-and-refresh
- Online tokens are scoped to one staff member's permissions. Use them only if you need per-user permission enforcement. https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens

**Recommendation for a NON-embedded, multi-tenant dashboard used first on the owner's own stores**

The following is my synthesis from the docs above.

1. Create the app in the **Dev Dashboard**, or with the CLI so you can keep config in `shopify.app.toml`. Set `embedded = false` (https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration).
2. Implement the **authorization code grant with `expiring=1`** and a refresh-token store from day one. It is the documented path for apps "outside the Shopify admin", it works for both custom and public distribution, and it already satisfies the Jan 2027 expiring-token rule if the app later goes public.
3. **Short-term shortcut:** if the owner's stores are in the same Dev Dashboard organization as the app, the client credentials grant gives 24h tokens with no OAuth UI. It can't serve other merchants, though, so it is a dead end for multi-tenancy.
4. **Distribution caveat:** custom distribution covers only one store, or several stores in one **Plus** organization. Several non-Plus stores would need either one custom app per store, or public distribution.
5. **Public listing caveat:** App Store requirement 2.2.2 says the app "must provide a consistent embedded experience", and Built for Shopify 3.1 says apps "should be embedded". A **non-embedded public listing would conflict** with App Store requirements, so plan an embedded shell (React Router template + App Bridge) before any public launch. https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements, https://shopify.dev/docs/apps/launch/built-for-shopify/requirements

### 3. Access scopes and protected customer data

Source for all rows: https://shopify.dev/docs/api/usage/access-scopes

| Need | Scope(s) | Approval | Notes |
|---|---|---|---|
| Orders, OrderTransaction, Fulfillment, AbandonedCheckout | `read_orders` | — | Covers **orders created in the last 60 days** only |
| Order history beyond 60 days | `read_all_orders` + `read_orders` | **Shopify approval required** | Partner Dashboard → Apps → app → **API access requests** → "Read all orders scope" card → Request access. Declaring it before approval makes version creation fail with `app_access` |
| Products / variants / collections | `read_products` | — | |
| `InventoryItem` (incl. `unitCost`) | `read_inventory` **or** `read_products` | — | `InventoryItem` docs say it "Requires `read_inventory` access scope or `read_products` access scope". `unitCost`: "the user must have 'View product costs' permission … once product granular permissions are enabled" (matters for online tokens). https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryItem |
| Customers | `read_customers` | — | Protected customer data rules apply |
| Returns | `read_returns` | — | `Refund` objects come via `read_orders` |
| Order edits (`CalculatedOrder`) | `read_order_edits` | — | |
| Shopify Payments payouts and balance transactions | `read_shopify_payments_payouts` | Not marked approval-required | Covers `ShopifyPaymentsPayout` + `ShopifyPaymentsBalanceTransaction`. `BalanceTransaction` also requires the user to have the `view_payouts` permission. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopifyPaymentsBalanceTransaction |
| Shopify Payments account (entry point for `balanceTransactions`, `disputes`, `payouts`) | `read_shopify_payments_accounts` (or `read_shopify_payments`, which is **approval required**) | — | https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopifyPaymentsAccount |
| Disputes / chargebacks (`ShopifyPaymentsDispute`) | `read_shopify_payments_disputes` | Not marked approval-required | Dispute **evidence** scopes are restricted to public apps whose core function is dispute management. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopifyPaymentsDispute |
| Fulfillment services | `read_fulfillments` | — | Also needed for `fulfillments/*` webhooks |
| Fulfillment orders | `read_merchant_managed_fulfillment_orders` etc. | — | |
| Shipping / carrier services | `read_shipping` | — | Shipping lines themselves come with the Order (`read_orders`) |
| ShopifyQL analytics | `read_reports` | — | `shopifyqlQuery` |

- Granted scopes can be checked at runtime with `currentAppInstallation { accessScopes }`. https://shopify.dev/docs/api/usage/access-scopes
- **Open question:** the docs describe the `read_all_orders` request flow only through the Partner Dashboard. Whether a Dev Dashboard app created in a merchant's own organization (custom / merchant-created) needs this approval is **not stated**. Verify in the dashboard.

**Protected customer data** (https://shopify.dev/docs/apps/launch/protected-customer-data)
- **Level 1** is customer data excluding name, address, phone and email. **Level 2** includes any of those fields.
- Public apps need a review for both levels. **Custom apps: "Always available"** for L1 and L2. Admin-created custom apps: L2 "varies by plan".
- Orders, refunds, transactions, fulfillment and order-related webhooks all count as protected customer data.
- Without approval, GraphQL returns HTTP 200 with redacted fields and an `errors` entry.
- **Dev stores:** "To access customer data in development, select the data and fields you're using in the Partner Dashboard. You don't need to submit a request for review for apps that are installed only on development stores." A distribution method must be selected first.
- "The API won't return data from non-development stores until your app is configured and approved." https://shopify.dev/docs/api/usage/access-scopes
- Profit analytics needs little PII. Requesting only Level 1 (no name, email or address) keeps any later public review simpler.

### 4. Bulk Operations (historical import)

Source unless noted: https://shopify.dev/docs/api/usage/bulk-operations/queries

- **Flow:** run `bulkOperationRunQuery(query: """…""")`, wait for completion, then download the JSONL file from `url`. If the operation failed, a partial file may be at `partialDataUrl`.
- **Concurrency:** "In API versions `2026-01` and higher, each app can run up to **five** bulk query operations per shop simultaneously." Before 2026-01 the limit was one of each type.
  - Also: https://shopify.dev/changelog/faster-bulk-operations
  - Bulk queries got up to 4x faster on 2026-06-17: https://shopify.dev/changelog/bulk-queries-now-execute-faster
- **Time limit:** a bulk query must finish within **10 days**, or it is marked `failed`.
- **Query restrictions:**
  - at most **5 connections** in the query;
  - connections nested at most **2 levels deep**;
  - connections must implement `Node`;
  - top-level `node` / `nodes` can't be used.
- **Monitoring:**
  - 2026-01+: use `bulkOperation(id:)` and the `bulkOperations` list query (filter by status, type and date). `currentBulkOperation` is deprecated. https://shopify.dev/changelog/new-queries-for-bulk-operations
  - Preferred: subscribe to the **`bulk_operations/finish`** webhook, which fires on complete, fail or cancel (status/error_code are lowercase in the payload). Then query `node(id: admin_graphql_api_id) { ... on BulkOperation { url partialDataUrl } }`.
  - Webhook delivery isn't guaranteed, so poll as a fallback.
- **Output:**
  - Download URLs are signed and **expire after one week**.
  - JSONL: one node per line. Nested connection children are emitted as separate lines carrying **`__parentId`**.
  - Parse it line by line with streaming.
- **`groupObjects` now defaults to `false`**, so children are not guaranteed to sit right after their parent; join on `__parentId`. For best performance, omit `groupObjects` on 2026-01+. https://shopify.dev/changelog/bulk-operations-group-objects-default-changed-to-false
- **Errors:** `ACCESS_DENIED`, `INTERNAL_SERVER_ERROR`, `TIMEOUT`; `CANCELED` if stalled.
  - Range searches should use a matching sortKey, e.g. `query: "created_at:>2024-05-01", sortKey: CREATED_AT`.
- Shopify CLI can also run bulk operations (2026-02-19). https://shopify.dev/changelog/use-the-admin-api-and-bulk-operations-in-shopify-cli
- **Implication:** order history needs `read_all_orders` to go past 60 days, whether you use bulk operations or not.
- **Design note (mine, not from the docs):** split the import into up to 5 parallel date-range jobs, e.g. orders with lineItems + refunds as one job and transactions as another, to stay within the 5-connection limit.

### 5. Webhooks

Topic → required scope, from the 2026-10 `WebhookSubscriptionTopic` enum (https://shopify.dev/docs/api/admin-graphql/2026-10/enums/WebhookSubscriptionTopic):

| Topic | Scope | Notes |
|---|---|---|
| `orders/create`, `orders/paid` | `read_orders` | |
| `orders/updated`, `orders/edited`, `orders/cancelled` | `read_orders` | |
| `orders/delete` | `read_orders` | |
| `refunds/create` | `read_orders` | "whenever a new refund is created without errors … independent from the movement of money" |
| `order_transactions/create` | `read_orders` | "when a order transaction is created or when it's status is updated. Only occurs for transactions with a status of success, failure or error" |
| `products/update` | `read_products` | |
| `inventory_items/update` | `read_inventory` or `read_products` | Product-scope access added 2025-03: https://shopify.dev/changelog/inventoryitem-webhooks-accessible-with-product-scopes |
| `inventory_levels/update` | `read_inventory` | |
| `disputes/create`, `disputes/update` | `read_shopify_payments_disputes` | |
| `returns/request` | `read_returns` | |
| `returns/close` | `read_orders` or `read_returns` | |
| `fulfillments/create`, `fulfillments/update` | `read_fulfillments` | |
| `app/uninstalled`, `app/scopes_update`, `shop/update` | — | |
| `bulk_operations/finish` | — | |

**Mandatory compliance webhooks** (https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- Topics: `customers/data_request`, `customers/redact`, `shop/redact`.
- Required for **App Store** apps. They must be configured in `shopify.app.toml` (`compliance_topics = [...]`) or the Dev Dashboard; they **can't** be subscribed through the Admin API. https://shopify.dev/docs/apps/build/webhooks/subscribe
- Handlers must return 401 for an invalid HMAC, acknowledge with a 2xx, and complete the action within 30 days.
- `shop/redact` arrives 48h after uninstall.
- `customers/redact` arrives 10 days after the request if the customer has had no order in 6 months; otherwise it is withheld until 6 months have passed.

**HMAC verification** (https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- Header `X-Shopify-Hmac-SHA256`: base64 HMAC-SHA256 of the **raw body**, keyed with the app client secret. Compare with `timingSafeEqual`.
- Applies to HTTPS delivery only; Google Pub/Sub and EventBridge deliveries don't need it.
- After rotating the secret, the new HMAC can take up to 1 hour to take effect.

**Subscription methods** (https://shopify.dev/docs/apps/build/webhooks/subscribe)
- **App-specific** (recommended): `[[webhooks.subscriptions]]` in `shopify.app.toml`, plus `[webhooks] api_version = "2026-10"`. Applies to every shop. Failing subscriptions are **not** deleted.
- **Shop-specific:** created with `webhookSubscriptionCreate` (GraphQL). Its version follows the request URL. Failing subscriptions **are deleted** after 8 consecutive failures.
- Destinations: HTTPS, Google Pub/Sub (`pubsub://project:topic`) or Amazon EventBridge. Shopify recommends Pub/Sub.
- Subscriptions now support a `name` field (2026-02-11). https://shopify.dev/changelog/webhook-subscriptions-now-support-a-name-field-for-identification

**Delivery semantics** (https://shopify.dev/docs/apps/build/webhooks, https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- **Ordering:** "Shopify doesn't guarantee ordering within a topic, or across different topics for the same resource." Order events by `X-Shopify-Triggered-At` or the payload's `updated_at`.
- **Duplicates:** duplicates can happen (at-least-once in practice), so make handlers idempotent and dedup on **`X-Shopify-Webhook-Id`**.
  - With several subscriptions to one topic, each delivery has a different Webhook-Id but the same **`X-Shopify-Event-Id`**.
- **Timeouts and retries:** respond 200 quickly. The connection timeout is 1s and the whole request times out at 5s. Failed deliveries are retried **8 times over 4 hours**.
- **Reconciliation:** "Webhook delivery isn't always guaranteed … use reconciliation jobs to periodically fetch data". Use `updated_at` filters, e.g. `orders(query:"updated_at:>…")`.
- Shopify "Events" is a newer alternative to webhooks for some topics and can be configured in the same TOML. https://shopify.dev/docs/apps/build/events-webhooks

### 6. GraphQL rate limits and pagination

Rate limits (https://shopify.dev/docs/apps/build/apis/graphql-admin/rate-limits):
- Based on **calculated query cost**, enforced per app+store as a leaky bucket.
- Restore rate by plan:

  | Plan | Points/second |
  |---|---|
  | Standard | 100 |
  | Advanced | 200 |
  | Plus | 1,000 |
  | Enterprise (Commerce Components) | 2,000 |

- Default field costs: scalar/enum 0, object 1, connection sized by `first`/`last`, mutation 10.
- The bucket must hold the requested cost before the query runs; it is refunded the difference between requested and actual cost afterwards.
- **A single query may not exceed 1,000 points.**
- Read throttle state from `extensions.cost.throttleStatus`. Send the header `Shopify-GraphQL-Cost-Debug=1` for a per-field breakdown.
- Recommended backoff is 1s; input arrays are capped at 250 items. https://shopify.dev/docs/api/usage/limits

Pagination (https://shopify.dev/docs/api/usage/pagination-graphql):
- Cursor-based (`first`/`after`, `pageInfo { hasNextPage endCursor }`).
- **Max 250 per page.**
- Pagination is capped at **25,000 objects**, and counts are capped there too (25,001 means "more"). Use bulk operations or date-filter windows for larger sets.

### 7. Order fields for profit calculation (2026-10 schema)

Source: https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order. Requires `read_orders`.

**Money: shop vs presentment currency.** Every `*Set` field is a `MoneyBag` holding `shopMoney` and `presentmentMoney`.
- `currencyCode` = "The shop currency when the order was placed".
- `presentmentCurrencyCode` = "The currency used by the customer".
- Use shopMoney for reporting.

**Order totals** (descriptions quoted from the docs):

| Field | Description |
|---|---|
| `subtotalPriceSet` | "sum of the prices for all line items after discounts and before returns … If taxesIncluded is true, then the subtotal also includes tax." |
| `currentSubtotalPriceSet` | "The total price of the order, after returns and refunds … This includes taxes and discounts." The wording is odd; verify empirically against `subtotalPriceSet` minus refunds. |
| `totalDiscountsSet` / `currentTotalDiscountsSet` | Before / after returns; order-level plus line-level discounts. |
| `totalTaxSet` / `currentTotalTaxSet` | Before / after returns and refunds. |
| `totalShippingPriceSet` | Docs text: "The total shipping costs returned to the customer … This includes fees and any related discounts that were refunded." Ambiguous; verify. |
| `currentShippingPriceSet` | "current shipping price after applying refunds and discounts". Includes tax if `taxesIncluded`. |
| `totalRefundedSet`, `totalRefundedShippingSet` | |
| `refundDiscrepancySet` | |
| `totalPriceSet`, `currentTotalPriceSet` | |
| `totalReceivedSet` | |
| `netPaymentSet` | Received minus refunded. |
| `totalOutstandingSet`, `totalCapturableSet` | |
| `totalTipReceivedSet` | "sum of all tip amounts" |
| `currentTotalDutiesSet`, `currentTotalAdditionalFeesSet` | |
| `taxesIncluded`, `test`, `cancelledAt`, `processedAt`, `sourceName` | Exclude `test` orders. |
| `disputes` | `[OrderDisputeSummary]` |
| `paymentGatewayNames`, `shippingLines` (connection), `channelInformation` | |

**Line items** (https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem)

| Field | Description |
|---|---|
| `originalUnitPriceSet` | Before discounts |
| `discountedUnitPriceSet` | Line-level discounts only |
| `discountedUnitPriceAfterAllDiscountsSet` | |
| `originalTotalSet`, `discountedTotalSet`, `totalDiscountSet` | |
| `discountAllocations` | Includes allocations to refunded and removed quantities |
| `quantity` | Includes refunded and removed units |
| `currentQuantity` | Excludes refunded and removed units |
| `refundableQuantity`, `unfulfilledQuantity` | |
| `isGiftCard` | Exclude gift-card purchases from revenue and COGS |
| `taxLines`, `duties`, `sku`, `vendor`, `requiresShipping` | |
| `variant { inventoryItem { unitCost } }` | **Current** cost only. There is no historical cost on the line item, so snapshot costs on ingest. |

- `InventoryItem.unitCost`: "Unit cost … The shop's currency is used." https://shopify.dev/docs/api/admin-graphql/2026-10/objects/InventoryItem

**Refunds** (https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Refund)
- `Refund` fields: `createdAt`, `totalRefundedSet`, `refundLineItems` (connection), `refundShippingLines` (connection), `orderAdjustments` (connection), `transactions` (connection), `duties`, `return`.
- `RefundLineItem`: `lineItem`, `quantity`, `priceSet`, `subtotalSet`, `totalTaxSet`, `restockType`, `restocked`, `location`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/RefundLineItem
- `RefundShippingLine`: `shippingLine`, `subtotalAmountSet`, `taxAmountSet`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/RefundShippingLine
- `OrderAdjustment`: `amountSet`, `taxAmountSet`, `reason` (`OrderAdjustmentDiscrepancyReason`). https://shopify.dev/docs/api/admin-graphql/2026-10/objects/OrderAdjustment

**Transactions and fees**
- `OrderTransaction` fields: `kind`, `status`, `gateway`, `formattedGateway`, `amountSet`, `processedAt`, `parentTransaction`, `test`, `manualPaymentGateway`, `settlementCurrency`, `settlementCurrencyRate`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/OrderTransaction
  - **`fees: [TransactionFee!]!`** — "Only present for Shopify Payments transactions."
  - `shopifyPaymentsSet` — "available only to stores on a Shopify Plus plan".
- `TransactionFee` fields: `amount`, `flatFee`, `flatFeeName`, `rate`, `rateName`, `taxAmount`, `type`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/TransactionFee
- `ShopifyPaymentsBalanceTransaction` fields: `amount`, **`fee`**, **`net`**, `type`, `sourceType`, `sourceId`, `sourceOrderTransactionId`, `associatedOrder`, `associatedPayout`, `transactionDate`, `adjustmentReason`, `test`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopifyPaymentsBalanceTransaction
  - Fee/net fields were added 2025-04: https://shopify.dev/changelog/new-fees-and-net-fields-for-balance-transactions
  - Currency-conversion type was added 2026-09-25: https://shopify.dev/changelog/shopify-payments-balance-transaction-graphql-type-supports-currency-conversion-type
  - Reached through `shopifyPaymentsAccount { balanceTransactions }`.
- **Non-Shopify-Payments gateways** (PayPal, etc.): no fee data. Use a configurable fee model.
- `ShopifyPaymentsDispute` fields: `amount`, `status`, `type` (inquiry vs chargeback), `reasonDetails`, `order`, `initiatedAt`, `finalizedOn`, `evidenceDueBy`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopifyPaymentsDispute

**Agreements and sales (accounting-accurate, event-dated revenue)**
- `Order.agreements` is a `SalesAgreementConnection`. https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order
- `SalesAgreement` (interface): "Shopify creates a sales agreement whenever an order is placed, edited, or refunded … records a sale for each line item". https://shopify.dev/docs/api/admin-graphql/2026-10/interfaces/SalesAgreement
  - Fields: `happenedAt`, `reason` (`OrderActionType`), `sales`, `app`, `user`.
  - Implementations: `OrderAgreement`, `OrderEditAgreement`, `RefundAgreement` (has `refund`), `ReturnAgreement`. Object pages exist under https://shopify.dev/docs/api/admin-graphql/2026-10/objects/
- `Sale` (interface) fields: `actionType`, `lineType`, `quantity`, `totalAmount`, `totalDiscountAmountBeforeTaxes`, `totalDiscountAmountAfterTaxes`, `totalTaxAmount`, `taxes`. https://shopify.dev/docs/api/admin-graphql/2026-10/interfaces/Sale
  - Implementations: `ProductSale` (has `lineItem`), `ShippingLineSale`, `TipSale`, `GiftCardSale`, `DutySale`, `FeeSale`, `AdditionalFeeSale`, `AdjustmentSale`, among others.
  - Rounding: "remaining currency units that couldn't be divided evenly are allocated one at a time … In aggregate, the values sum up correctly."
  - `FeeSale.fee` has been nullable since 2025-07. https://shopify.dev/changelog/feesale-fee-field-is-nullable-as-of-2025-07
- **Recommendation:** use agreements/sales (keyed by `happenedAt`) to attribute edits and refunds to the day they happened, the way Shopify Analytics does. Use the `current*` totals for an order-level snapshot.

### 8. Shopify CLI, templates, standalone apps

- "Shopify recommends the **React Router template** for most new apps" (`@shopify/shopify-app-react-router`).
  - Other templates: Extension-only, Express (Node + React), Ruby.
  - Scaffold with `shopify app init` → "Build a React Router app".
  - https://shopify.dev/docs/api/libraries-and-templates, https://shopify.dev/docs/apps/build/scaffold-app
- `@shopify/shopify-app-remix` docs now say "The new `@shopify/shopify-app-react-router` package … is the recommended path forward", with a migration guide. https://shopify.dev/docs/api/shopify-app-remix/latest
- **Standalone Next.js:** there is no official Next.js template. It is supported by building "with your own tech stack" using the framework-agnostic Node libraries:
  - `@shopify/shopify-api` (OAuth, webhooks, billing);
  - `@shopify/admin-api-client` (lightweight GraphQL client);
  - plus the authorization code grant for a non-embedded app;
  - set `embedded = false` in `shopify.app.toml`.
  - Sources: https://shopify.dev/docs/api/libraries-and-templates, https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps, https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration
- Official PHP (`shopify/shopify-app-php`) and Python (`shopifyapp`) packages reached 1.0. https://shopify.dev/changelog (entry "Build Shopify apps in PHP and Python with new official packages")

---

## GOOGLE ADS API

### 9. Version, access levels, OAuth

**Current version: v26, released October 14, 2026.** Sunset is tentatively November 2027.
- Upcoming: v26.1 (Oct 2026), v26.2 (Nov 2026).
- Other live versions: v23.x (sunset Feb 2027), v24.x (May/Jun 2027), v25.x (Aug 2027).
- Sources: https://developers.google.com/google-ads/api/docs/sunset-dates, https://developers.google.com/google-ads/api/docs/release-notes
- Major versions last about 12 months and minors about 10. At most two upgrades are needed per year.

**MAJOR 2026 CHANGE: developer tokens were sunset on September 9, 2026.** https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- API access levels now attach to the **Google Cloud project** that owns the OAuth client (or the service account).
- You sign up in the Cloud Console (**Google Ads API Overview** page), not in the Ads manager-account API Center. A manager account is no longer needed for signup.
- Sending a `developer-token` header is "optional and ignored by the API servers". Google "will start rejecting developer tokens in API calls in a future major version", so stop sending it.
- Projects with Test access that call a production account get `AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (v25+).
- **Stale summaries:** several doc pages still have AI page summaries mentioning a 22-character developer token (e.g. https://developers.google.com/google-ads/api/docs/concepts/call-structure, https://developers.google.com/google-ads/api/rest/auth). The page bodies and the sunset FAQ are authoritative.

**Access levels** (https://developers.google.com/google-ads/api/docs/api-policy/access-levels)

| Level | Accounts | Daily operation limit | How to get it | Review |
|---|---|---|---|---|
| **Test** | Test accounts only | 15,000 ops/day | Automatic when you enable the API | — |
| **Explorer** | Test + **production** | **2,880 ops/day** on production | Apply on the Overview page | Often auto-granted |
| **Basic** | Test + production | 15,000 ops/day | **Brand verification** of the Cloud project first | "automated and will be reviewed within minutes after brand verification" (https://developers.google.com/google-ads/api/docs/api-policy/developer-token) |
| **Standard** | Test + production | Unlimited | Manual audit; must meet Required Minimum Functionality | Typically **10 business days** |

- Explorer **can't use**: account creation, user management, keyword/reach planning, or billing services. Reporting (GAQL) is allowed.
- "Per day" means a sliding 24h window.
- Permissible use (Ad management / **Reporting** / Research) applies only to Standard.
- RMF applies only to Standard; a "Reporting Only" tool category exists. https://developers.google.com/google-ads/api/docs/api-policy/rmf

Known issues listed on the developer-token page (as of today):
- Explorer/Basic applications are rejected for projects on the Cloud **Free Trial** or with suspended billing.
- Some upgrades made after Sept 9 aren't honored yet (`AUTHORIZATION_ERROR`); the workaround is a new Cloud project. https://developers.google.com/google-ads/api/docs/api-policy/developer-token

**Test accounts** (https://developers.google.com/google-ads/api/docs/best-practices/test-accounts)
- Work with a Test-level project, no approval needed.
- They need a separate hierarchy under a **test manager account**, serve no ads, have no metrics/serving data, are capped at 50 accounts per hierarchy, and are deleted after 1 year of inactivity.
- For a spend dashboard, Explorer access on real accounts (2,880 ops/day) is the practical dev path.

**OAuth for a web app** (https://developers.google.com/google-ads/api/docs/oauth/multi-user-authentication)
- Use the **multi-user** workflow with scope `https://www.googleapis.com/auth/adwords`.
- Request **offline access** to get a refresh token, store one refresh token per user, and complete **OAuth App verification**.
- Configure OAuth in the **same Cloud project** that holds the API access level. https://developers.google.com/google-ads/api/docs/oauth/overview
- For only your own accounts, Google recommends a **service account** workflow. https://developers.google.com/google-ads/api/docs/oauth/overview
- The adwords scope is **sensitive**, so verification is needed for public use:
  - https://developers.google.cn/google-ads/api/docs/oauth/cloud-project?hl=en (search snippet: "Google Ads API scope is classed as sensitive")
  - https://ads-developers.googleblog.com/2020/10/google-ads-and-adwords-apis-upgrading.html
  - https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Exceptions (no verification): personal use / a few known users, dev/test projects (Testing status), and internal Workspace use. https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- **Gotcha:** an External consent screen in "**Testing**" status issues refresh tokens that **expire in 7 days**. There is also a limit of 100 refresh tokens per Google Account per client ID. https://developers.google.com/identity/protocols/oauth2
- Brand verification itself takes "a few minutes" (Cloud Console → OAuth consent screen → Branding → Verify Branding). https://developers.google.com/google-ads/api/docs/api-policy/brand-verification

**`login-customer-id` header** (https://developers.google.com/google-ads/api/docs/concepts/call-structure)
- **Required** when access to the account comes through a manager (MCC): set it to the manager's ID, without hyphens. Otherwise the call fails with `USER_PERMISSION_DENIED`.
- Not needed when the user has direct access to the account.
- `CustomerService.ListAccessibleCustomers` lists the accounts the user can reach directly.
- `linked-customer-id` is for partners acting on product links.

### 10. GAQL daily spend, currency, timezone, transport, Node

```sql
SELECT customer.id, customer.currency_code, customer.time_zone,
       campaign.id, campaign.name, ad_group.id, ad_group.name,
       segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks
FROM ad_group
WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-17'
```

- `metrics.cost_micros` is INT64: "The sum of your cost-per-click (CPC) and cost-per-thousand impressions (CPM) costs". https://developers.google.com/google-ads/api/fields/v26/metrics
  - It is in micros of the account currency (÷1,000,000). This is the API-wide `*_micros` convention, e.g. `amount_micros` 500000 in the budget examples (https://developers.google.com/google-ads/api/docs/campaigns/budgets/create-budgets). I didn't find an explicit "÷1e6" sentence on the field page.
- `segments.date` is "yyyy-MM-dd". https://developers.google.com/google-ads/api/fields/v26/segments
- `customer.currency_code` is immutable ISO 4217; `customer.time_zone` is immutable. https://developers.google.com/google-ads/api/fields/v26/customer
- **All date ranges are evaluated in the account's time zone (`customer.time_zone`), not UTC.** https://developers.google.com/google-ads/api/docs/query/date-ranges
  - Store spend per account-local date and convert when joining to Shopify's shop timezone.
- **Transport:** "Google Ads API is a gRPC API, with REST bindings." Official client libraries (Java, .NET, PHP, Python, Ruby use gRPC; Perl uses REST) are recommended. https://developers.google.com/google-ads/api/docs/rest/overview, https://developers.google.com/google-ads/api/docs/concepts/call-structure
- **REST endpoints:**
  - `POST https://googleads.googleapis.com/v26/customers/{CUSTOMER_ID}/googleAds:search` returns fixed pages of 10,000 rows with `nextPageToken`. https://developers.google.com/google-ads/api/rest/common/search
  - `:searchStream` is also available, and is faster for large reports. https://developers.google.com/google-ads/api/docs/get-started/make-first-call, https://developers.google.com/google-ads/api/docs/reporting/streaming
  - Access tokens last about 1 hour.
- **Node.js:** there is **no official Google library**.
  - Google lists `google-ads-api` (npm) as a community library: "We don't test, contribute to, or maintain these libraries". https://developers.google.com/google-ads/api/docs/client-libs
  - npm `google-ads-api` latest is **25.1.0** (published 2026-09-17; repo Opteo/google-ads-api; README badge "google ads v25.1"). https://registry.npmjs.org/google-ads-api, https://github.com/Opteo/google-ads-api
  - It lags v26.
- **Options for a TS stack:** (a) call REST directly with `fetch` plus google-auth-library, which pins the version per URL, has few dependencies and is what I suggest; or (b) use the Opteo library and accept its version lag.

---

## META MARKETING API (brief)

These facts come from web-search snippets of developers.facebook.com, which was blocked to direct fetch. **Re-verify.**

- **Current version:** Graph API & Marketing API **v26.0**, released **July 29, 2026**, expiry TBD.
  - v25.0 was released Feb 18, 2026 and expires Jul 29, 2028 (per the versions table snippet).
  - No v27.0 was found as of today.
  - https://developers.facebook.com/docs/graph-api/changelog/versions/, https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/, https://developers.facebook.com/docs/graph-api/changelog/version26.0
- **`ads_read`:** lets the app use the Ads Insights API for accounts it owns or was granted access to. Allowed usage: "custom dashboards and data analytics". https://developers.facebook.com/docs/permissions
- **Access tiers:**
  - **Standard access** to ads_read/ads_management is enough when the app manages only **its own** ad accounts.
  - Managing **other people's** accounts needs **Advanced Access**, which goes through App Review and, per third-party sources, Business Verification.
  - https://developers.facebook.com/docs/marketing-api/get-started/authorization, https://developers.secure.facebook.com/docs/marketing-api/access
  - An older official threshold for Ads Management Standard Access (1,500 calls in 15 days, <10% errors) may be outdated.
- **Insights for daily spend:** `GET /act_{AD_ACCOUNT_ID}/insights?level=campaign|adset|ad&fields=spend,campaign_id,adset_id,ad_id,account_currency&time_increment=1&time_range={...}`
  - `time_increment=1` gives daily rows; the default is all_days.
  - Use async report jobs for large pulls.
  - Retention is about 36 months per third-party sources.
  - Sources: https://developers.secure.facebook.com/docs/marketing-api/insights/marketing-mix-modeling/, https://docs.databricks.com/aws/en/ingestion/lakeflow-connect/meta-ads-concepts
  - Exact parameter semantics are **unverified** against the primary reference (https://developers.facebook.com/docs/marketing-api/insights).
- **Day boundary:** Insights days follow the **ad account's timezone**. This is industry knowledge; **unverified** in this session.

## TIKTOK (brief)

- TikTok API for Business (Marketing API) is at https://business-api.tiktok.com/portal, which was blocked from this session.
- **Access steps:**
  1. Register as a developer.
  2. Create a developer app that declares the scopes it needs (e.g. ad account management and **Reporting**).
  3. Pass TikTok's app review. Per secondary sources this takes days to about two weeks, and APIs are unavailable until approval. The official TikTok for Developers FAQ (updated 2026-08-04, for the developers.tiktok.com platform) also cites "several days to two weeks".
  4. Have each advertiser authorize the app through TikTok's OAuth-style advertiser authorization flow. The app receives an access token tied to the authorized advertiser IDs.
- Business Center membership and business verification are commonly required for production or higher-volume access.
- Third-party guides name **v1.3** as the active Marketing API version.
- Spend comes from the reporting (integrated report) endpoint at campaign/adgroup/ad level with a daily dimension.
- Sources: https://developers.tiktok.com/docs/en/getting-started-faq, https://unified.to/blog/how_to_get_your_tiktok_ads_api_key, https://bundle.social/blog/tiktok-api-approval
- **All TikTok details are unverified against primary docs.**

---

## Open questions to verify by hand

1. Is `read_all_orders` approval needed, and how is it requested, for a Dev Dashboard app created in the merchant's own organization (no Partner Dashboard)?
2. The official date when admin-created custom apps stopped being creatable (third parties say 2026-01-01).
3. How to bring existing production stores into one Dev Dashboard organization so the client credentials grant works for all of the owner's stores.
4. The exact semantics of `totalShippingPriceSet` and `currentSubtotalPriceSet`. The doc wording is ambiguous; test against real orders.
5. Primary Meta and TikTok docs (blocked here).
