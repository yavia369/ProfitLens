# Connect a Shopify store to ProfitLens (owner's own stores)

Time: about 10 minutes. You need to be the **store owner** (or a staff member with app development
permissions) of the store you're connecting.

This creates a private ProfitLens app inside your store's own Shopify organization, with **read-only**
access. ProfitLens never writes to your store.

> Why this method: ProfitLens isn't publicly deployed yet, so Shopify can't redirect to it during a normal
> OAuth install. Apps created in your store's own organization can be installed from the Dev Dashboard,
> and ProfitLens then requests short-lived (24-hour) access tokens from Shopify with the app's client
> credentials. This is Shopify's documented method for apps acting on stores in your own organization:
> https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard

---

## Step 1: Open the Dev Dashboard
1. Sign in to the Shopify admin of **LURAFLO** as the owner.
2. Open https://dev.shopify.com/dashboard in the same browser.
   - Alternative route: Shopify admin → **Settings** → **Apps** → **Develop apps** → follow the link to build apps in the Dev Dashboard.
3. If you're asked to choose an organization, pick the one that contains the **LURAFLO** store (not a Partner organization).

## Step 2: Create the app
1. Make sure **Apps** is selected in the left sidebar, then click **Create app** (top right).
2. Choose **Start from Dev Dashboard**.
3. Name it **ProfitLens**, then click **Create**.

## Step 3: Create and release a version (this sets the permissions)
On the app's **Versions** page, fill in:

| Field | Value |
|---|---|
| **App URL** | leave the default `https://shopify.dev/apps/default-app-home` |
| **Embed app in Shopify admin** | off, if the option is shown (ProfitLens runs on its own site) |
| **Webhooks API version** | `2026-10` (the newest) |
| **Scopes** | the list below |

Scopes to add (all read-only):
```
read_orders, read_all_orders, read_products, read_inventory, read_customers, read_returns, read_shopify_payments_payouts, read_shopify_payments_disputes
```
| Scope | Why ProfitLens needs it |
|---|---|
| `read_orders` | orders, line items, refunds, transactions, sales ledger (last 60 days) |
| `read_all_orders` | order history older than 60 days |
| `read_products`, `read_inventory` | products, variants and Shopify's "cost per item" |
| `read_customers` | new vs returning customers (we store only an ID, country and first-order date: no names or emails) |
| `read_returns` | returns and restock information |
| `read_shopify_payments_payouts` | actual Shopify Payments fees |
| `read_shopify_payments_disputes` | chargebacks |

Click **Release**.

> **If Release fails** with an error mentioning `read_all_orders` or access approval: remove `read_all_orders`,
> release again, and tell me. ProfitLens will import the last 60 days and show "history limited" until access
> is granted.

## Step 4: Install the app on LURAFLO
1. Open the app and click **Install app** at the top of the **Installs** card.
2. In the tab that opens, select the **LURAFLO** store.
3. Review the requested permissions (all "read"/"view") and click **Install**.

## Step 5: Copy the credentials (do NOT paste them into the chat)
1. In the app, open **Settings** (or **App settings**).
2. Copy the **Client ID** and the **Client secret**.

## Step 6: Give the credentials to the ProfitLens development environment
1. In this Claude session's title bar, open the **cloud environment** menu and choose **Edit**.
2. Add these **environment variables** (use the *Network secrets* / *API credentials* section if your app shows one; otherwise add them as environment variables):

   | Name | Value |
   |---|---|
   | `SHOPIFY_CLIENT_ID` | the Client ID |
   | `SHOPIFY_CLIENT_SECRET` | the Client secret |
   | `SHOPIFY_SHOP_DOMAIN` | `gpnj6g-tr.myshopify.com` |

3. Save, then **start a new session** in this environment and send: **"Continue Phase 4."**
   The new session reads `docs/PROJECT_STATUS.md` and picks up exactly where this one stopped.

---

### Security notes
- The client secret only ever lives in environment configuration, never in the repository or the browser.
- Access tokens last 24 hours and are requested on demand; they're stored encrypted (AES-256-GCM) if persisted.
- To revoke access at any time: Shopify admin → **Settings** → **Apps** → ProfitLens → **Uninstall**, or rotate the
  client secret in the Dev Dashboard.

### Later: public deployment
Once ProfitLens is deployed on a public HTTPS domain (Phase 9), webhooks will be registered so changes arrive
within seconds. Until then, ProfitLens polls Shopify for changes every 15 minutes.
