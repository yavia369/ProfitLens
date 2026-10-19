# Meta Ads setup (owner guide)

ProfitLens reads your Meta ad spend with a **system user** in your Business Manager: a non-human account that
can only read the ad accounts you assign to it. Nothing in your ad accounts is changed. Verified against Meta's
developer docs on 2026-10-19 (Marketing API v26.0).

## What you need
- A Meta Business Manager (business.facebook.com) that owns or has access to the ad account(s).
- Admin access to that Business Manager.

## Steps
1. **Create an app** at developers.facebook.com → My Apps → Create app → type **Business**, owned by your
   Business Manager. Add the **Marketing API** product. Your app starts on the default "Limited" access tier,
   which is enough to read your own ad accounts (`ads_read` with standard access), but Meta rate-limits it heavily
   and describes it as being for development. Apply for **Full access** in the App Dashboard if syncs start to hit rate limits.
2. **Create a system user**: Business settings → Users → System users → Add → role **Employee**.
3. **Assign the ad account**: on the system user → Assign assets → Ad accounts → choose the account(s) →
   permission **View performance** (read-only).
4. **Generate a token**: on the system user → Generate new token → choose the app from step 1 → permission
   **ads_read** only → choose the expiry:
   - **Never** (simplest): paste only the token into ProfitLens.
   - **60 days** (Meta recommends this; some businesses must use it): also give ProfitLens the app's **App ID** and
     **App secret** (App Dashboard → App settings → Basic) so it can refresh the token before it expires.
5. **Connect**: ProfitLens → Settings → Stores & integrations → Meta Ads → paste the token (and app ID/secret
   for 60-day tokens) → Connect. Then choose the store for each ad account.

Never paste tokens or secrets into chat. They go only into the form, which stores them encrypted.

## What ProfitLens imports
- Daily spend per campaign for the last 3 years, then every 6 hours, re-reading the last 3 days to pick up Meta's
  corrections. Days are in the ad account's time zone; Meta reports them that way.
- Meta-reported purchases and purchase value (`omni_purchase`, using your ad account's attribution setting),
  always labelled "platform-reported". Profit always uses Shopify orders, never Meta's figures.
- Spend in another currency is converted at the day's ECB reference rate.
- Spend you entered by hand under Costs → Ad spend for a day Meta covers is replaced by the API figure (no double counting).
