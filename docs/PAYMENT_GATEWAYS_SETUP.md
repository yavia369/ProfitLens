# Stripe and PayPal setup (owner guide)

Shopify reports the processing fee only for Shopify Payments. For orders paid through **Stripe** or **PayPal**,
ProfitLens otherwise uses the estimate from your fee rules (Costs → Fees). Connecting the processor account lets
ProfitLens use the **actual** fee on the orders it can match with certainty. Everything is read-only; nothing in
your Stripe or PayPal account is changed. Checked against the providers' docs on 2026-10-19.

## How matching works (D-052)
- ProfitLens imports each received payment and its fee (Stripe balance transactions of type charge/payment;
  PayPal payment transactions with status "success").
- A payment is matched to a Shopify payment only when **exactly one** successful Shopify sale or capture on a
  Stripe/PayPal gateway has the **same amount and currency within 15 minutes**, and no other processor payment
  claims the same Shopify payment.
- A matched order shows the fee as **actual (matched)** with the processor's transaction ID in its breakdown.
  Shopify's third-party transaction fee (if your plan charges one) is still added on top.
- Everything else (no candidate, several candidates, contested) is **not guessed**: the order keeps the rule
  estimate and the payment is listed under Settings → Stores & integrations → Payment processors → Unmatched
  payments, with the reason.
- A fee in another currency than the store's is converted at the day's ECB reference rate; with no rate the
  order keeps its estimate.
- First sync imports the last 90 days; then every 6 hours, re-reading the last 72 hours (PayPal lists
  transactions up to 3 hours late).

## Stripe
1. Stripe Dashboard → Developers → API keys → **Create restricted key** → "Providing this key to another website".
2. Set **Read** on **Balance**, **Charges** and **PaymentIntents**; leave everything else at **None**.
   (ProfitLens reads `GET /v1/balance_transactions` with each charge expanded. The exact permission names come
   from the Dashboard and are INFERRED here; if a sync reports a missing permission, Stripe's message names it,
   so add that one as Read.)
3. ProfitLens → Settings → Stores & integrations → Payment processors → choose the store → **Stripe** → paste the
   `rk_live_…` key → Connect.

## PayPal
1. developer.paypal.com → Apps & Credentials → **Live** → Create App (type Merchant).
2. In the app's features, enable **Transaction search** (needed for `GET /v1/reporting/transactions`). PayPal can
   take a while to grant it; until then syncs report a permission error.
3. ProfitLens → Settings → Stores & integrations → Payment processors → choose the store → **PayPal** → paste the
   app's **Client ID** and **Secret** → Connect.

Never paste keys or secrets into chat. They go only into the form, which checks them with a one-day read and
stores them encrypted. For the operator CLI, set `STRIPE_SECRET_KEY` or `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`
in the environment and run `pnpm --filter @profitlens/worker sync payments-connect <email> <storeId> stripe|paypal`.

## Limits
- Matching relies on Shopify naming the gateway "stripe…" or "paypal…" on the transaction (INFERRED for apps
  that rename it). Payments from other channels in the same processor account simply stay unmatched.
- Stripe amounts in three-decimal currencies (BHD, JOD, KWD, OMR, TND) are skipped, not guessed.
- Refund fees and dispute fees from the processors are not imported yet; refunds keep the existing fee rules.
