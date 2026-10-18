# TrueProfit — User Flows

> Labels as in the feature inventory (V/D/I/U). TrueProfit flows are reconstructed from
> documentation; we could not walk them live (no account, app host not reachable), so
> **screen-by-screen details are D or I, never V**, unless stated.
> Each flow ends with **"Our flow"**: the design decision for our product.

## F1. Install & onboarding — D (HC/11330293 v9.32, HC/11324699, HC/15855069)
1. Merchant installs from the Shopify App Store and approves scopes (V: scope list from connector).
2. Welcome → **choose a plan** (14-day trial, Shopify billing).
3. Review store settings: currency, display language, default date range, payment-status filter.
4. "How did you hear about us?" → Dashboard.
5. A **data-sync banner** shows Shopify history import progress and an ETA.
6. Recommended setup order: COGS → shipping → marketing channels → transaction fees → custom costs/taxes/handling.
7. Pixel permission granted at install; read-only Shopify Payments permission added later (v9.33).

**Gaps (U):** the time the initial import takes; the history depth actually imported (pricing says "unlimited", integration docs say 3 years).

**Our flow:** sign up (email + password or Google) → create organization → **Connect Shopify store**
(OAuth) → onboarding checklist with live status, where each step shows its effect on profit
completeness: (1) historical import progress, (2) COGS coverage %, (3) shipping cost method,
(4) transaction-fee source (actual vs rule), (5) ad accounts, (6) recurring expenses,
(7) calculation policy review. The dashboard is usable immediately, with a **"Profit completeness"** meter.

## F2. Connect an ad account — D (HC/11325313, HC/13349042)
Integrations → choose channel → OAuth → **select ad accounts** → "Sync Ad Spend" → history
backfill (≤ 3 years) → recurring sync every 5–15 min while a user is logged in. Per-account stop or
disconnect; last sync time shown.

**Our flow:** identical shape, but the sync runs server-side on a schedule **whether or not
anyone is logged in**. We show per-account currency and timezone, backfill progress and the last
error, plus **manual spend entry** for channels without an integration (labelled "manual").

## F3. Configure COGS — D (HC/12381267, HC/16051710)
Cost Settings → Cost of Goods → table of products (expand to variants) → inline edit unit cost →
optional bundle tiers / zones → Save → the change applies to **new orders only** → optional
"Recalculate COGS" for chosen products over all time or a date range (async, progress in Data Sync Status).

**Our flow:** variant table with **effective-dated cost versions** (each edit asks "effective
from": today, a date, or "all history"). Recalculation is automatic and idempotent because costs
are resolved by order date. Plus a CSV import/export with a preview diff, bulk edit, a "missing cost"
filter, and a supplier-landed-cost breakdown (product + inbound shipping + handling).

## F4. Shipping & fees setup — D
- Shipping: pick a method (quantity/weight tiers), build zones and product groups, preview an
  example order, save, optionally recalculate past orders.
- Transaction fees: gateways listed automatically; edit % + fixed per gateway; Shopify 3rd-party
  fee by plan; actual fees used for Shopify Payments, PayPal and Stripe when available.

**Our flow:** the same rule engine in a simpler table, with an **example-order preview**
and an explicit **source badge** per order fee (`actual` / `rule` / `missing`).

## F5. Daily dashboard use — V (screenshot) + D
Open the app → store switcher (or All stores) → date range + comparison → read KPI cards → hover a
label for its formula → performance chart (granularity) → cost breakdown → drill into a report.

**Our flow:** same, plus a **"why did profit change?"** variance breakdown versus the comparison
period (bridge chart: revenue Δ, COGS Δ, ads Δ, …), last-sync timestamps per source, and
completeness warnings on cards.

## F6. Investigate an order — D (HC/15164172, HC/16554887) + V (connector order schema)
Orders Report → filter/search → row shows revenue, costs, profit → expand fees → edit shipping/COGS/
handling inline (locked if synced) or bulk edit / CSV round-trip.

**Our flow:** order drawer with a **line-by-line calculation trace** (every input, its source,
effective date, policy applied, rounding). Overrides are recorded as **adjustments with an
audit trail** rather than overwriting synced values.

## F7. Monthly P&L — D (HC/11330268)
P&L Report → range + interval → expand Ad Spend by channel and Custom Costs by category → export CSV/XLSX.

**Our flow:** same rows, plus a store-comparison mode, **PDF export**, and a fixed banner reading
"Management report — not a GAAP/IFRS statement".

## F8. Add a custom expense — D (HC/12289182)
Custom Costs → Add → fixed (amount, currency, start/end, repeat daily/weekly/monthly) or variable
(% of metric / per order / per order tag) → category → save.

**Our flow:** same types, plus **explicit allocation rules** (spread evenly per day, or on the
start date) and an audit log of edits.

## F9. Multi-store — D (HC/11330347)
Store switcher → specific store or **All stores** (converted to a base currency at daily rates).

**Our flow:** same. The consolidated view shows each store's currency, its FX rate source and
date, and any store with stale sync.

## F10. Data refresh / errors — D (HC/15919801, v9.19)
Notifications bell (action-required: expired keys, failed connections) is separate from the Data Sync
Status hub (progress). "Last updated" indicator; manual refresh for a broken Shopify connection.

**Our flow:** a **Sync Center** page listing each source's status, last success, next run, error
log and retry. A header indicator turns amber or red when data is stale.

## F11. Export — D (HC/11330278)
Export button per report → file auto-downloads and is kept on the Exports page for 7 days.

**Our flow:** synchronous CSV for small exports; async jobs for large exports and PDFs, kept for 7 days.
