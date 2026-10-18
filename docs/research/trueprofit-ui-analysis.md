# TrueProfit — UI / UX Analysis

> Phase 1 research. Evidence labels: **VERIFIED** (directly observed, evidence cited),
> **DOCUMENTED** (official TrueProfit page), **INFERRED** (reasoned assumption),
> **UNKNOWN** (no access/evidence).
>
> Primary visual evidence: an owner-supplied screenshot (`user-provided-tp-dashboard.png`), an authorized screenshot
> of the TrueProfit demo store dashboard supplied by the project owner (2026-10-18).
> Screenshots are in `screenshots/` (internal reference only; third-party material — never reuse as app assets).
> Supplementary: official product-page images (see
> `_raw/product-pages-notes.md`) and the TrueProfit MCP connector's report-config response.
> The authenticated app (`app.trueprofit.io`) could not be opened from the research environment
> (host not on the network allow-list, and we have no login), so interaction states such as hover,
> loading and error are **UNKNOWN** unless stated otherwise.

## 1. Global layout — VERIFIED (screenshot)

| Region | Observation |
|---|---|
| Theme | Dark navy UI (page ≈ `#13213a`, cards a slightly lighter navy), white/grey text, teal accent for the active nav item and positive values, red for adverse deltas. No light-mode toggle visible. |
| Left sidebar | Fixed, ≈ 236 px wide. Logo top-left. Collapsible groups: **Reports** (expanded) → Dashboard, Product Analytics, Orders Report, P&L Report, Marketing Attribution, Customer Lifetime Value, Exports. Collapsed groups: **Cost Settings**, **Integrations**, **Store Settings**. Footer: "Chat with Support" (live chat widget). Each item has an icon. "Orders Report" is rendered dimmed (INFERRED: plan-gated or disabled in demo). |
| Top bar | Store switcher dropdown at top-left of content ("TrueProfit Demo stor…", with globe/avatar icon and up/down caret) → multi-store switching. Right side: AI assistant button (sparkle icon), "Get mobile app" button, notifications bell, account/avatar menu. |
| Page header | Title "Dashboard" + a ⇄ icon (INFERRED: switch dashboard layout / customize). Right: date-range button ("Last 7 Days" with calendar icon), comparison button ("Compare: Same Period, Last Month"), kebab (⋮) menu (INFERRED: customize cards / export / refresh). |
| Content width | Content is centred with generous margins (~145 px each side at 1908 px width). |

## 2. KPI cards — VERIFIED (screenshot)

Two rows:

- **Row 1, five separate cards:** Net Profit `$14,684.23`, Orders `169`, Revenue `$25,135.00`,
  Total Costs `($10,450.77)`, COGS `($5,941.00)`.
- **Row 2, one panel holding five metrics:** Net Profit Margin `58.42%`, Transaction Fees
  `($1,282.32)`, Units Sold `914`, Total Ad Spend `($0.00)`, Shipping Costs `($2,742.00)`.

Card anatomy: a label with a dotted underline (INFERRED: a hover tooltip with the definition),
a large value, and a delta badge under it showing an arrow and a percentage versus the
comparison period.

Formatting conventions (VERIFIED):
- Costs use accounting parentheses: `($10,450.77)`.
- Currency symbol and 2 decimals; thousands separators.
- Percent with 2 decimals.
- Delta colour is **semantic, not directional**: cost metrics going up are red (`↗ 0.75%` on
  Total Costs in red), revenue/profit going up are green. Ad spend at 0 shows `0%` neutral green.

Arithmetic consistency check (VERIFIED from screenshot numbers):
- Revenue − Total Costs = 25,135.00 − 10,450.77 = **14,684.23** = Net Profit ✔
- COGS + Transaction Fees + Shipping + Ad Spend = 5,941.00 + 1,282.32 + 2,742.00 + 0 =
  **9,965.32**, leaving **485.45** of Total Costs unexplained by visible cards
  → INFERRED: other components (handling fees, custom costs, refund-related costs, or taxes)
  make up Total Costs but are not shown as cards.
- Net margin 14,684.23 / 25,135.00 = 58.42% ✔ → margin denominator is **Revenue**.

The set of default cards matches the connector's `profitAnalyticFields` (VERIFIED, connector
`get_report_config`): `total_net_profit, total_order, total_revenue, total_cost,
total_net_margin, total_ads_spend, total_avg_order, total_units_sold, gross_sales, gross_profit,
total_cogs`. A separate `mobileProfitAnalyticFields` list exists, so **card selection is
user-configurable and stored separately for web and mobile** (VERIFIED, config fields).

## 3. Performance chart — VERIFIED (screenshot)

- Title "Performance"; granularity dropdown "Daily" (INFERRED options: Daily/Weekly/Monthly;
  connector tools accept `period: day|week|month` — VERIFIED).
- Combined chart, dual Y axis:
  - Left axis in currency (`$6k … ($6k)`), symmetric around 0.
  - Right axis in percent (`60% … -60%`).
  - **Revenue**: teal bars above zero.
  - **Total Costs**: blue bars drawn *below* zero (negative), same x position.
  - **Net Profit**: yellow line.
  - **Net Profit Margin**: dashed orange line on the % axis.
- X axis: one tick per day ("May 2, 2025" … "May 8, 2025").
- Legend top-right, horizontal.

## 4. Other screens — DOCUMENTED / INFERRED

See `_raw/product-pages-notes.md` and `_raw/helpdesk-notes.md` for the per-screen descriptions
these notes are condensed from; the feature inventory holds the canonical list.

| Screen | What we know |
|---|---|
| Product Analytics | DOCUMENTED: a table per product/variant with revenue, COGS, profit, margin. Columns confirmed by the connector product schema (VERIFIED): variant SKU, price, `cogs`, `handling_fee`, `cogs_history` keyed by source (`shopify`, `trueprofit`, `cj`), `cogs_edited_at`, zone (`zone_name: global`, per-zone exclusion). |
| Orders Report | VERIFIED via connector order schema: name, created/processed dates, financial and fulfillment status, gateway, line items, total price, discounts, tax, shipping price, COGS (with source `manual`/`Trueprofit`), shipping cost (with source), handling fee, transaction fees broken down by gateway, per-order **ad spend with status** (`pending` / `awaiting`, with a `finalizedDate` 30 days after the order), profit, margin, customer visit source/UTM. |
| P&L Report | DOCUMENTED (see product notes). |
| Marketing Attribution | DOCUMENTED + connector tool description: pixel-based; *direct* = last ad click, *assisted* = earlier ad clicks within a 30-day window; levels account/campaign/ad group/ad; ranked by net profit on ad spend. |
| Customer Lifetime Value | VERIFIED via connector `get_customer_overview`: total customers, CAC, LTV, LTV:CAC ratio string (`"1.61 : 1"`), repurchase rate, total repurchase customers, total spent, countries list. |
| Cost Settings | VERIFIED via connector `get_shop_details`: default COGS rate %, default shipping rate, shipping calculation `{method: "max", type: "item", ship_together: false}`, per-gateway transaction fees `{fee_rate, flat_fee, gateway_fee}`, Shopify third-party fee by plan. |

## 5. Interaction & states — mostly UNKNOWN

| Aspect | Status |
|---|---|
| Date presets | VERIFIED: "Last 7 Days" exists; the connector skill lists Today, Yesterday, Last 7/30 days, This month, Last month, custom range. Default range is configurable (`defaultDateRange: "today"` in report config — VERIFIED). |
| Comparison | VERIFIED: "Compare: Same Period, Last Month" — comparison mode is selectable (INFERRED options: previous period, same period last month/year, none). |
| Loading skeletons / empty states / error states | UNKNOWN (no live access). |
| Mobile web layout | UNKNOWN; there is a native mobile app (DOCUMENTED, "Get mobile app" CTA VERIFIED). |
| Tooltips | INFERRED from the dotted underlines on metric labels. |
| AI assistant | VERIFIED button present; behaviour UNKNOWN (DOCUMENTED elsewhere as an AI/MCP feature). |

## 6. Design implications for our product (our decisions, not observations)

1. Keep the information hierarchy (hero KPI row → secondary KPI panel → combined
   performance chart → breakdowns), but use an **original visual identity**: a light-first
   theme with an optional dark mode, our own palette, typography, iconography and logo.
2. Keep accounting conventions (parentheses for costs, semantic delta colours) — they are
   industry practice, not TrueProfit-specific.
3. Every KPI card gets a **"How is this calculated?"** popover linked to the calculation
   breakdown. TrueProfit's tooltip-only definitions are a gap we can beat.
4. Add **data-completeness badges** on cards (for example "COGS missing for 212 of 235
   variants"), which TrueProfit does not show (VERIFIED: Luraflo has many `cogs: "0"` variants
   and TrueProfit's order profit treats them as 0 cost).
5. Keep the combined revenue/cost/profit/margin chart, but make the axes and series accessible
   (patterns plus colour) and expose a data table toggle.
