# TrueProfit public product pages: research notes

- Collected on 2026-10-18 from public pages only (curl through the agent proxy). No login was used.
- Every fact is tagged **[DOCUMENTED]** and cites its source URL. Comparison and marketing pages are TrueProfit's own claims and are labelled as claims.
- Short URL prefixes used below:
  - `PU/` = `https://trueprofit.io/product-updates/`
  - `SOL/` = `https://trueprofit.io/solutions/`
  - `UC/` = `https://trueprofit.io/usecase/`
  - `CMP/` = `https://trueprofit.io/comparison/`
  - `WHY` = `https://trueprofit.io/why-trueprofit`
- Some page text is not visible in the rendered HTML. It sits in the Next.js RSC/ACF payload embedded in the page, which is still public page source. Facts taken from there are marked "(page payload)".

---

## 0. Release chronology (product-updates sitemap)

Dates are `datePublished` from each page's JSON-LD, which matches the `<lastmod>` in https://trueprofit.io/productupdates.xml. The byline date shown on a page is sometimes the later `dateModified`. A URL slug does not always match the page title.

| Published | Modified | Title (slug) | Main content |
|---|---|---|---|
| 2023-06-20 | 2025-09-15 | "A Big Step Forward: Product Analytics v2, Tax Settings, and Beyond" (PU/june-release-notes) | Product Analytics v2 + TrueProfit Pixel; Taxes & Duties cost settings; Enterprise plan; Marketing Analytics teaser |
| 2023-08-22 | 2025-09-15 | "Product Analytics Gets Even Better: More Metrics, Sharper Accuracy" (PU/august-trueupdate-whats-new-in-trueprofit) | New Product Analytics columns with formulas; Parameter Generator Chrome extension; costs shown as negatives; notifications |
| 2024-04-17 | 2025-09-15 | "TrueProfit Meets X Channel, Plus a Few More Things You'll Love" (PU/april-trueupdate-whats-new-in-trueprofit-v6-7, "v6.7") | X (Twitter) Ads integration; French UI; referral program |
| 2024-11-20 | 2025-05-16 | "A Smoother Way to Set Shipping Costs (and More Tweaks…)" (PU/october-trueupdate-whats-new-in-trueprofit) | Shipping-cost UI redesign; CJ Dropshipping improvements; COGS bulk actions |
| 2024-12-09 | 2025-09-15 | "TrueProfit Dashboard Gets a Fresh Look" (PU/trueprofit-dashboard-fresh-look) | Performance chart revamp; Orders vs Ad Spend Per Order chart; pinned KPIs |
| 2025-02-21 | 2025-04-28 | Affiliate program (PU/new-trueprofits-affiliate-program-earn-20-recurring-commission) | 20% recurring commission for 3 months (not a product feature) |
| 2025-04-21 | 2025-09-15 | "New Version, New Vibes: TrueProfit Mobile…" (PU/new-version-new-vibes-trueprofit-mobile-gets-smoother-and-smarter) | Mobile app redesign; more charts and metrics on mobile |
| 2025-06-12 | 2025-06-25 | Printify / Printful / Gelato (PU/now-live-trueprofit-integrates-with-printify-printful-gelato) | POD COGS + shipping sync |
| 2025-06-25 | 2025-06-25 | More fulfillment platforms (PU/more-fulfillment-platforms-seamlessly-synced-with-trueprofit) | Zopi, Eprolo, Teelaunch, Gooten |
| 2025-09-08 | 2025-09-08 | Yotpo (PU/yotpo-x-trueprofit-sms-email-marketing-meets-profit-tracking) | Yotpo SMS/email spend and revenue as a marketing channel |
| 2025-10-15 | 2025-10-15 | AutoDS (PU/from-autods-to-trueprofit-your-costs-automatically-synced) | AutoDS COGS + shipping sync into Orders Report |
| 2025-10-27 | 2025-11-24 | "A New Level of Customization: Upgraded Custom Cost" (PU/a-new-level-of-customization-custom-revenue-upgraded-custom-cost) | Custom Cost v3 (fixed and variable unified). The slug says "custom revenue", but the current page text never mentions Custom Revenue |
| 2025-11-25 | 2025-12-17 | Custom Metrics (PU/track-the-metrics-you-need-custom-metrics-is-here) | Formula-based custom metrics on the dashboard |
| 2026-02-04 | 2026-02-04 | Transaction Fees revamped (PU/transaction-fees-revamped-what-changed-why-it-matters) | Guided setup; gateway auto-detection; PayPal and Stripe integrations |
| 2026-05-13 | 2026-05-13 | TrueProfit MCP (PU/trueprofit-mcp-turn-ai-into-your-second-finance-brain) | Read-only MCP server for Claude, ChatGPT and OpenClaw |
| 2026-06-05 | 2026-06-05 | Focused dashboard (PU/a-more-focused-dashboard-and-smoother-reporting) | Net-profit hero; easier Add/Create metric; time range persists; include/exclude today |
| 2026-07-21 | 2026-07-21 | AI-powered import is back (PU/faster-cost-tracking-ai-powered-import-is-back) | "Extract Bill with AI" for fixed costs |
| 2026-08-31 | 2026-08-31 | Chargebacks (PU/better-tracking-for-shopify-chargebacks-is-here) | Chargeback Loss + Chargeback Fee from Shopify Payments |

---

## 1. Features and UI elements

### 1.1 Main dashboard

Purpose and content:
- One dashboard for all key metrics, with "visualized charts and real-time insights". [DOCUMENTED] SOL/profit-dashboard
- "360-degree overview": a "logically arranged & customizable table from orders, revenue, to ROAS, AOV, and ultimately net profit". [DOCUMENTED] SOL/profit-dashboard
- "Trends analyzer": compare performance against historical data. [DOCUMENTED] SOL/profit-dashboard
- Interactive graphs, charts and tables show spend and costs. [DOCUMENTED] SOL/profit-dashboard
- Ad tracking on the dashboard: data from all ad channels is shown on the board. [DOCUMENTED] SOL/profit-dashboard
- An "Ad Spend by Channel" section shows each channel's Ad Spend and Revenue (UTM). [DOCUMENTED] PU/april-trueupdate-whats-new-in-trueprofit-v6-7
- A "dynamic line graph": select metrics and view them over days, weeks or months. [DOCUMENTED] SOL/profit-dashboard

Stores, currency and freshness:
- All-store view versus individual store views ("One Hub For All Stores"). Since Dec 2024 the all-store view mirrors the single-store UI. [DOCUMENTED] SOL/profit-dashboard; PU/trueprofit-dashboard-fresh-look
- Currency and time zone follow the Shopify store settings and cannot be set separately in TrueProfit. [DOCUMENTED] SOL/profit-dashboard (FAQ)
- Data is presented as real time, with a "minor delay while we fetch the latest details from your Shopify store". [DOCUMENTED] SOL/profit-dashboard (FAQ)
- Multiple Shopify stores can be added to one account, but each store needs its own subscription. [DOCUMENTED] SOL/profit-dashboard (FAQ); WHY (FAQ)

**Dec 2024 refresh** (PU/trueprofit-dashboard-fresh-look):
- Performance Chart [DOCUMENTED]:
  - one shared Y-axis scale for all metrics;
  - Revenue and Total Costs drawn as bars, other metrics as lines;
  - fixed to 4 metrics: **Net Profit, Net Profit Margin, Revenue, Total Costs**.
- New chart **"Orders vs. Ad Spend Per Order"**: order volume against ad spend per order over time. [DOCUMENTED]
- Redesigned buttons for time range, **compare periods**, filters, **exports** and settings. [DOCUMENTED]
- **Pinned key metrics** at the top: Revenue, Orders, Avg. Order Profit, Net Profit, Net Profit Margin. Users add more metrics below these through the **Customize** menu. [DOCUMENTED]

**Jun 2026 update** (PU/a-more-focused-dashboard-and-smoother-reporting):
- The top section was refreshed so that **Net Profit** is more prominent. [DOCUMENTED]
- The **"Add metrics"** and **"Create custom metric"** entry points are easier to find; their behaviour did not change. [DOCUMENTED]
- The selected time range (e.g. Last 7 Days, Last 30 Days) now persists across Dashboard, Product Analytics, Orders Report and Marketing Attribution. Before this, it reset when moving between pages. [DOCUMENTED]
- New toggle to **include or exclude today** (partial-day data) in the selected range. [DOCUMENTED]

Other dashboard notes:
- WHY describes the dashboard as "Real-time, customizable dashboard… Drag, drop, build your perfect view." [DOCUMENTED] WHY
- WHY also lists "Multi-currency support" and "Custom email reports". The BeProfit comparison lists "Scheduled email reports: Yes". [DOCUMENTED] WHY; CMP/trueprofit-vs-beprofit
- Seen in the reference image (/landing/dashboard.webp on WHY) [DOCUMENTED, image]:
  - header "Dashboard" with a store-switch icon;
  - "Last 30 Days" date picker and "Compare to: Previous period";
  - KPI cards: Revenue, Net Profit, Total Costs (shown in parentheses as a negative), Net Profit Margin, Orders;
  - "Performance" chart with a "Daily" granularity dropdown and a dual axis ($ on the left, % on the right);
  - "Cost Breakdown" donut showing Total Cost and % change, with legend COGS, Shipping Costs, Total Ad Spend, Transaction Fees, Custom Costs, Handling Fees.
- The second image (monitor.webp) shows [DOCUMENTED, image]:
  - KPI cards with a % change versus the compare period (green or red arrows): Revenue, Orders, Net Profit, Net Profit Margin, Total Costs, COGS;
  - a kebab menu;
  - Cost Breakdown legend that adds **Taxes Paid**.

### 1.2 P&L report

- Real-time P&L: "All your income and expenses… in a neatly organized format". [DOCUMENTED] SOL/pnl-profit-and-loss
- Filter by any time period: daily, weekly or monthly, "or even years". [DOCUMENTED] SOL/pnl-profit-and-loss
- Consolidated all-store view or individual store reports. [DOCUMENTED] SOL/pnl-profit-and-loss
- **Export to Excel or CSV.** [DOCUMENTED] SOL/pnl-profit-and-loss (FAQ)
- Requires the Advanced plan or above. [DOCUMENTED] SOL/pnl-profit-and-loss (FAQ); WHY pricing
- Rows mentioned: revenue, cost of goods sold, gross profit, operating expenses, net profit. [DOCUMENTED] UC/profit-tracking
- Taxes Paid entries are included in the cost breakdown and the P&L. [DOCUMENTED] PU/june-release-notes
- **Chargeback Loss** and **Chargeback Fee** were added as 2 P&L line items placed "before Profit-related line items". [DOCUMENTED] PU/better-tracking-for-shopify-chargebacks-is-here
- Marketing claims "Customizable P&L report… for any date range". [DOCUMENTED] WHY
- "From payment fees to random invoices, TrueProfit reveals naked expenses in your P&L report." [DOCUMENTED] SOL/expense-tracking

### 1.3 Product Analytics

- Product-level cost breakdown and product-level net profit. Highlights ad spend per product and net profit per product "including the elusive ad spend". [DOCUMENTED] SOL/product-analytics (page payload)
- Funnel insights: product page views, add-to-cart rates and conversion rates. [DOCUMENTED] SOL/product-analytics
- Ad spend per product is tracked with "first-party data collection method using unique URL parameters", generated by the **TrueProfit Parameter Generator** Chrome extension. [DOCUMENTED] SOL/product-analytics (FAQ); PU/august-trueupdate-whats-new-in-trueprofit
- Plan: "Advanced plan and above" per SOL/product-analytics. This conflicts with the WHY pricing block, which lists Product Analytics under Basic. The Triple Whale comparison shows it unticked for Basic and costing $60/month. [DOCUMENTED, inconsistent]
- **v2, June 2023**: Google Analytics UA was replaced by **TrueProfit Pixel**. New columns: Revenue, Gross Profit, Gross Profit Margin, Checkout Started, Payment Info Submitted, "and more". [DOCUMENTED] PU/june-release-notes
- **Aug 2023 columns**: Ad Spend, Total Cost, Net Profit, Net Profit Margin, Net Profit on Ad Spend. Formulas are in section 2. [DOCUMENTED] PU/august-trueupdate-whats-new-in-trueprofit
- Per-product net profit from X ads appears in Product Analytics. [DOCUMENTED] PU/april-trueupdate-whats-new-in-trueprofit-v6-7
- Image (scale.webp) shows a "Most Profitable Products" card with product thumbnail, Net Profit, Net Profit Margin, Revenue, COGS and Ad Spend. [DOCUMENTED, image] WHY

### 1.4 Orders Report

- An "Orders Report" page exists, and the time range persists into it. [DOCUMENTED] PU/a-more-focused-dashboard-and-smoother-reporting
- COGS and shipping costs synced from AutoDS appear in the Orders Report. [DOCUMENTED] PU/from-autods-to-trueprofit-your-costs-automatically-synced
- Order data synced from CJ appears "instantly" in the order report through Shopify webhooks. [DOCUMENTED] PU/october-trueupdate-whats-new-in-trueprofit
- "Order-level analytics" and "Order-level profit analytics" are listed as features. [DOCUMENTED] CMP/trueprofit-vs-beprofit; WHY
- The public pages give no explicit list of Orders Report columns. NOT DOCUMENTED.

### 1.5 Marketing Attribution

- Described as "cross-channel server-side tracking" and "first-party data". It is said to be unaffected by iOS 14 or cookie restrictions and to remove double-claimed conversions across platforms. [DOCUMENTED] SOL/marketing-attribution
- Attribution model: **Last-clicked Purchases** (the ad that directly led to the sale) plus **Assisted Purchases** (ads that contributed earlier in the journey). [DOCUMENTED] SOL/marketing-attribution; CMP/trueprofit-vs-triple-whale
- Uses **Net Profit on Ad Spend** in place of ROAS. [DOCUMENTED] SOL/marketing-attribution
- Customer-journey and touchpoint view ("from the first interest to the final purchase"). [DOCUMENTED] SOL/marketing-attribution
- Levels: "every ad level, from campaigns to creatives" (page payload). Net profit, net profit margin and NPOAS are available "for each ad, ad set, campaign, and account". [DOCUMENTED] SOL/marketing-attribution; UC/profit-optimization
- Metrics per channel and per ad [DOCUMENTED] SOL/marketing-attribution (FAQ):
  - Assisted purchases, Last-clicked purchases
  - Impressions, Amount spent, Clicks, CTR
  - Adds to cart, Cost per ATC
  - Purchases, Purchase value, Cost per purchase, Conversion rate
  - Revenue, Total cost, Net profit, Net profit margin
- Setup takes "under 5 minutes". [DOCUMENTED] SOL/marketing-attribution
- Plan: listed under Ultimate in the WHY pricing block; the Triple Whale comparison says Enterprise. [DOCUMENTED, inconsistent] WHY; CMP/trueprofit-vs-triple-whale
- Claimed "19.3%" more accurate than Triple Whale. This is a marketing claim. [DOCUMENTED] CMP/trueprofit-vs-triple-whale
- History: teased in June 2023 as "Marketing Analytics… Multi-channel attribution". [DOCUMENTED] PU/june-release-notes
- Image (scale.webp) shows a "Most Profitable Ads" table with columns Ad Level (channel icon + ad name), Assisted Purchases, Last-clicked Purchases, Net Profit and Net Profit on Ad Spend. [DOCUMENTED, image] WHY

### 1.6 Ad tracking metrics

From the UC/ad-tracking FAQ [DOCUMENTED]:
- Ad spend data:
  - Ad spend per product
  - Ad spend by channel
  - Total ad spend
  - POAS (Profit on ad spend)
  - ROAS
  - **ROAS (UTM)**: ROAS from ads with UTM campaign sources
  - **ncROAS**: ROAS from new customers
- Channel marketing metrics: Impressions, Clicks, CTR, Adds to cart, Purchases, Conversion Rate.

Other ad-tracking facts:
- Net Profit on Ad Spend (NPOAS) is positioned as the core ad metric. [DOCUMENTED] UC/ad-tracking
- Multiple ad accounts are supported, and spend is tracked down to ad level even across multiple stores. [DOCUMENTED] UC/profit-tracking (FAQ)
- An "Ad Sync Custom Rules" feature exists on the Advanced plan and above. Its details are not described. [DOCUMENTED] WHY pricing
- A review mentions automatic VAT calculation on TikTok Ads spend. This is customer-review content only. [DOCUMENTED, review] UC/ad-tracking (page payload)

### 1.7 Customer Lifetime Value / cohorts

- Metrics: total customers, repurchase rate, LTV, CAC and LTV:CAC ratio. [DOCUMENTED] SOL/customer-lifetime-value (FAQ)
- Country filter, to compare customer value by country. [DOCUMENTED] SOL/customer-lifetime-value (FAQ)
- Tags: "Estimate Future Revenue, Measure Customer Retention, Predict Purchase Frequency". The page also mentions forecasting revenue growth rate. [DOCUMENTED] SOL/customer-lifetime-value
- "All-time overview" image name. [DOCUMENTED] SOL/customer-lifetime-value
- "LTV cohorts" / "LTV Cohorts analysis" are available on every plan. [DOCUMENTED] CMP/trueprofit-vs-triple-whale (page payload); CMP/trueprofit-vs-lifetimely (page payload)
- Available on the Basic plan and above. [DOCUMENTED] SOL/customer-lifetime-value
- CAC appears as a key metric. [DOCUMENTED] WHY

### 1.8 Cost settings

The supported cost types are Ad Spend, COGS, Shipping Costs, Transaction Fees, Handling Fees, Taxes Paid, and Other expenses (custom costs). [DOCUMENTED] SOL/expense-tracking (FAQ)

**COGS**
- COGS zones by delivery destination. Unlimited COGS Zones come with the Ultimate plan. [DOCUMENTED] SOL/expense-tracking; WHY pricing
- Set at product or variant level. [DOCUMENTED] SOL/expense-tracking
- Synced from Shopify or CJ Dropshipping, or imported from CSV. [DOCUMENTED] SOL/expense-tracking
- Editable in the app. [DOCUMENTED] SOL/expense-tracking
- "Quantity-based COGS" is on the Basic plan. [DOCUMENTED] WHY pricing
- Rules by SKU, quantity and region. [DOCUMENTED] WHY comparison table
- Image tags read "by SKU / by Bundle / by Country". [DOCUMENTED, image] WHY cogs.webp
- **Time-period COGS**: the default COGS covers a product's lifetime, and users can add **unlimited COGS periods** so historical orders use the cost at the time of sale. [DOCUMENTED] SOL/expense-tracking (FAQ); CMP/trueprofit-vs-beprofit
- **Bulk actions** (Nov 2024): select multiple products and change product source, adjust COGS, or update handling fees. [DOCUMENTED] PU/october-trueupdate-whats-new-in-trueprofit
- AliExpress COGS sync was described as "set to be available soon". [DOCUMENTED] SOL/expense-tracking (FAQ)

**Shipping**
- Rules by location, product, quantity or weight. [DOCUMENTED] SOL/expense-tracking
- "weight, quantity, and destination country" [DOCUMENTED] WHY
- BeProfit comparison row: "weight, order value, or destination country". [DOCUMENTED] CMP/trueprofit-vs-beprofit
- Shipping-cost UI redesign (Nov 2024) focuses on 3 actions: **set shipping rules, create custom shipping zones, group products**. [DOCUMENTED] PU/october-trueupdate-whats-new-in-trueprofit
- Shipping can also be synced from shipping carriers and fulfillment platforms. [DOCUMENTED] CMP/trueprofit-vs-beprofit

**Handling fees**
- Exist as a cost type and are bulk-editable. [DOCUMENTED] SOL/expense-tracking; PU/october-trueupdate-whats-new-in-trueprofit

**Taxes & Duties** (June 2023)
- A fixed amount, or a custom tax rate subtracted from Revenue, COGS or Profit. [DOCUMENTED] PU/june-release-notes
- Either has an end date or is ongoing. [DOCUMENTED] PU/june-release-notes
- Repeat frequency: Monthly, Weekly, Daily or One-time. [DOCUMENTED] PU/june-release-notes
- Included in the cost breakdown and the P&L. Available on all plans; worked on Shopify and Amazon. [DOCUMENTED] PU/june-release-notes

**Custom Costs**
- Fixed or variable fees. [DOCUMENTED] UC/profit-tracking
- Examples: agency fees, one-time payments, labour costs. [DOCUMENTED] SOL/expense-tracking
- BeProfit comparison rows: "Fixed costs (apps, salaries, rent, etc.)" and "Variable costs (packaging, handling, etc.)". [DOCUMENTED] CMP/trueprofit-vs-beprofit
- **Custom Cost v3** (Oct 2025) unified Fixed and Variable Costs into "one seamless setup flow". [DOCUMENTED] PU/a-new-level-of-customization-custom-revenue-upgraded-custom-cost
- Custom Costs has its own item in the left-hand navigation. [DOCUMENTED] PU/faster-cost-tracking-ai-powered-import-is-back
- **Custom Revenue**: only the URL slug mentions it ("custom-revenue"). The current page body does not describe it. NOT DOCUMENTED beyond the slug.

**AI cost import / "AI Bill Extractor"** (relaunched 2026-07-21; it existed before, then was withdrawn)
- Steps [DOCUMENTED] PU/faster-cost-tracking-ai-powered-import-is-back:
  1. Custom Costs (left nav)
  2. **Extract Bill with AI**
  3. Drag and drop or select a file (**PNG, JPEG, PDF, CSV**)
  4. **Extract Cost**
  5. A preview screen appears; the user must review and edit, then click **Add to Custom Costs**
- Intended for fixed costs: Shopify subscription, app subscriptions, other opex. [DOCUMENTED] same page
- Extracts multiple expenses in bulk and adds several at once. [DOCUMENTED] SOL/expense-tracking

**Transaction fees** (revamped 2026-02-04)
- Unified setup page with a guided flow, clearer labels and in-flow guidance. [DOCUMENTED] PU/transaction-fees-revamped-what-changed-why-it-matters
- **Gateway auto-detection** from Shopify orders; the user reviews and adjusts. [DOCUMENTED] same page
- Why it changed: gateway setup was "easy to overlook… if your store uses multiple payment methods or starts testing a new one"; the goal is "less risk of missing a gateway". [DOCUMENTED] same page
- **PayPal and Stripe integrations** sync actual transaction-fee data. [DOCUMENTED] same page
- Shopify Payments fees are synced, and custom gateway rules are supported. [DOCUMENTED] CMP/trueprofit-vs-beprofit
- Tracking covers "PayPal, Stripe, Shopify Payments, and more". [DOCUMENTED] SOL/expense-tracking

**Chargebacks** (2026-08-31)
- Chargeback and dispute data is synced automatically from **Shopify Payments only**. Other gateways are not yet supported. [DOCUMENTED] PU/better-tracking-for-shopify-chargebacks-is-here
- Disputes that end **Lost or Accepted** create 2 amounts [DOCUMENTED] same page:
  - **Chargeback Loss**: the order amount taken back;
  - **Chargeback Fee**: the processing fee charged when the chargeback is filed.
- Both are deducted from Net Profit; **Revenue and Total Cost stay unchanged**. [DOCUMENTED] same page
- Shown on [DOCUMENTED] same page:
  - the Dashboard, as standalone metrics and inside the Net Profit breakdown;
  - the P&L, as 2 line items before the profit lines;
  - mobile dashboards and widgets on iOS and Android;
  - both single-store and multi-store views.
- Preference for the recording date: **Resolution date** (default, Shopify's) or **Order date**. [DOCUMENTED] same page
- **Shopify Protect**-covered chargebacks are excluded from Chargeback Loss. [DOCUMENTED] same page

### 1.9 Custom Metrics builder (2025-11-25)

- Create metrics defined by "formulas based on TrueProfit's supported metrics". [DOCUMENTED] PU/track-the-metrics-you-need-custom-metrics-is-here
- Monitored on the main dashboard and updated automatically in real time. [DOCUMENTED] same page
- Since June 2026, reached through the dashboard's "Create custom metric" button. [DOCUMENTED] PU/a-more-focused-dashboard-and-smoother-reporting
- Custom metrics live in the dashboard; TrueProfit MCP with Claude covers custom reports. BeProfit, by contrast, requires a request on its Plus plan. [DOCUMENTED] CMP/trueprofit-vs-beprofit

### 1.10 Notifications and display conventions (Aug 2023)

- **All cost metrics are displayed as negative values.** This is display only and does not affect calculations. [DOCUMENTED] PU/august-trueupdate-whats-new-in-trueprofit
- Sync progress and updates are saved as separate notification items, sorted by completion time. They are **kept for 72 hours**, and completed items can be cleared. [DOCUMENTED] same page
- The screenshots show costs in parentheses, e.g. "($118,800.00)". [DOCUMENTED, image] WHY dashboard.webp

### 1.11 Mobile app

- iOS and Android apps. [DOCUMENTED] SOL/profit-dashboard; CMP/trueprofit-vs-lifetimely
- Apr 2025 redesign [DOCUMENTED] PU/new-version-new-vibes-trueprofit-mobile-gets-smoother-and-smarter:
  - consistent with the web app;
  - faster;
  - smoother store switching;
  - more charts and metrics, "the same detailed views… in the desktop version".
- Mobile dashboard **widgets** exist (they now show chargeback metrics). [DOCUMENTED] PU/better-tracking-for-shopify-chargebacks-is-here

### 1.12 Other platform features

- **Languages**: French was added in Apr 2024 (Profile dropdown at the top right, then Language). [DOCUMENTED] PU/april-trueupdate-whats-new-in-trueprofit-v6-7
- **Team members**: unlimited on Enterprise. [DOCUMENTED] WHY pricing
- **Onboarding Manager**: on Ultimate. [DOCUMENTED] WHY pricing
- **Help channels**: in-app chat, email and a Discord community. [DOCUMENTED] PU/a-more-focused-dashboard-and-smoother-reporting; PU/october-trueupdate-whats-new-in-trueprofit
- **Demo store**: a public "View demo store" link appears on every solution page. [DOCUMENTED] SOL/*
- **Security**: GDPR and CCPA compliant; encryption. [DOCUMENTED] WHY; SOL/marketing-attribution
- **Referral program** (2024) and **affiliate program** (2025): 20% recurring for up to 3 months, paid via PayPal. [DOCUMENTED] PU/april-trueupdate-whats-new-in-trueprofit-v6-7; PU/new-trueprofits-affiliate-program-earn-20-recurring-commission

### 1.13 TrueProfit MCP (2026-05-13)

- An MCP server gives **read-only** access to TrueProfit data from **Claude, ChatGPT (Plus and above) and OpenClaw**. [DOCUMENTED] PU/trueprofit-mcp-turn-ai-into-your-second-finance-brain
- Use cases [DOCUMENTED] same page:
  - instant profit Q&A;
  - custom reports on demand (Claude is recommended for table rendering);
  - trend spotting and forecasting;
  - cross-tool automations, e.g. a weekly Slack summary or a Google Doc draft.
- Marketed as "AI-powered analysis". [DOCUMENTED] WHY

### 1.14 Integrations

Ad and marketing channels:
- **Current list**: Facebook Ads, Google Ads, TikTok Ads, Taboola, Snapchat, Microsoft Ads, Yotpo, X (formerly Twitter), AppLovin, Amazon Ads, AdRoll. [DOCUMENTED] SOL/integrations
- WHY adds Pinterest Ads. [DOCUMENTED] WHY
- Older FAQ lists: Facebook, Google, TikTok, Snapchat, Pinterest, Microsoft (Bing), Amazon, X. [DOCUMENTED] UC/ad-tracking; SOL/expense-tracking
- **X Ads** (Apr 2024) [DOCUMENTED] PU/april-trueupdate-whats-new-in-trueprofit-v6-7:
  - connected via Marketing Channels page, then Connect, then OAuth;
  - feeds Ad Spend by Channel (Dashboard), per-product net profit (Product Analytics) and ad-level net profit (Marketing Attribution).
- **Yotpo** (Sep 2025) [DOCUMENTED] PU/yotpo-x-trueprofit-sms-email-marketing-meets-profit-tracking:
  - Yotpo spend, revenue, ROAS, clicks, impressions and conversions appear on the Main Dashboard;
  - Yotpo spend is **included in Total Ad Spend**;
  - Yotpo data is added to the same charts as the other channels.

Fulfillment / dropship / POD platforms (COGS + shipping sync):
- **Current list**: AutoDS, CJ Dropshipping, Zopi, Eprolo, Printify, Printful, Gelato, Gooten, Teelaunch. [DOCUMENTED] SOL/integrations
- **CJ Dropshipping** improvements (Nov 2024) [DOCUMENTED] PU/october-trueupdate-whats-new-in-trueprofit:
  - zone-specific COGS mapping (previously everything defaulted to "Worldwide");
  - instant sync through Shopify webhooks;
  - per-line-item / per-variant COGS mapping for multi-variant orders.
- **Printify, Printful, Gelato** (Jun 2025) [DOCUMENTED] PU/now-live-trueprofit-integrates-with-printify-printful-gelato:
  - COGS and shipping update automatically for each new order;
  - connected once;
  - claimed to be "the one and only Shopify profit analytics platform" with these integrations.
- **Zopi, Eprolo, Teelaunch, Gooten** (Jun 2025): COGS and shipping sync, connected from the Integrations tab. [DOCUMENTED] PU/more-fulfillment-platforms-seamlessly-synced-with-trueprofit
- **AutoDS** (Oct 2025) [DOCUMENTED] PU/from-autods-to-trueprofit-your-costs-automatically-synced:
  - COGS and shipping for AutoDS orders sync and show in the Orders Report;
  - counted in COGS and profit calculations.

Other integrations:
- **Shipping providers**: Shippo, ShipBob, ShippingEasy, Shiphero, Shipwire, ShipStation (6, on all plans). [DOCUMENTED] SOL/integrations; UC/profit-tracking
- **Sales channels**: Shopify and TikTok Shop. [DOCUMENTED] SOL/integrations; CMP/trueprofit-vs-beprofit
- Amazon was also mentioned in 2023 for taxes. [DOCUMENTED] PU/june-release-notes
- **Payments**: PayPal and Stripe (2026), plus Shopify Payments. [DOCUMENTED] PU/transaction-fees-revamped-what-changed-why-it-matters

### 1.15 Pricing (as of the crawl)

Source: WHY; CMP/trueprofit-vs-triple-whale [DOCUMENTED]

| Plan | Price | Orders included | Extra orders | Max surcharge | Adds |
|---|---|---|---|---|---|
| Basic | $35/mo | 300 | $0.30 each | $300 | Real-time profit dashboard, CLV, Quantity-based COGS, Custom Costs, (Product Analytics per WHY only) |
| Advanced | $60 | 600 | $0.20 | $500 | P&L Report, Ad Sync Custom Rules |
| Ultimate | $100 | 1500 | $0.10 | $700 | Unlimited COGS Zones, Onboarding Manager, Marketing Attribution |
| Enterprise | $200 | 3500 | $0.07 | $1000 | Unlimited Team Members, Prioritized Support |

- 14-day free trial; prorated plan changes. [DOCUMENTED] WHY
- An Enterprise plan with annual pricing based on trailing 12-month revenue was introduced in June 2023. [DOCUMENTED] PU/june-release-notes

---

## 2. Formulas, definitions and calculation policies

- **Total Cost (product level)** = COGS + Transaction Fees + Handling Fees + Shipping Costs + Ad Spend. [DOCUMENTED] PU/august-trueupdate-whats-new-in-trueprofit
- **Net Profit (product level)** = Revenue − Total Cost. [DOCUMENTED] same page
- **Net Profit Margin** = (Net Profit / Revenue) × 100. [DOCUMENTED] same page
- **Net Profit on Ad Spend (NPOAS)** = Net Profit / Ad Spend. [DOCUMENTED] same page. UC/ad-tracking calls it the earnings "after all advertising costs are deducted".
- **Ad Spend per product** comes from TrueProfit's own URL parameters, generated by the Parameter Generator extension. That extension auto-detects the ad platform (Facebook, Google, TikTok…) and auto-fills the URL-parameter field in the ads manager. [DOCUMENTED] PU/august-trueupdate-whats-new-in-trueprofit
- **ROAS (UTM)**: ROAS from ads with UTM campaign sources. **ncROAS**: ROAS from new customers. **POAS**: profit on ad spend. [DOCUMENTED] UC/ad-tracking
- **LTV:CAC ratio** = LTV relative to CAC; higher is better. [DOCUMENTED] SOL/customer-lifetime-value
- **Net profit (general)**: revenue minus all operating expenses, interest, taxes and other costs. [DOCUMENTED] UC/profit-tracking
- **Chargebacks policy** [DOCUMENTED] PU/better-tracking-for-shopify-chargebacks-is-here:
  - only disputes with status Lost or Accepted count;
  - Chargeback Loss and Chargeback Fee reduce Net Profit only, leaving Revenue and Total Cost unchanged;
  - recording date is the resolution date by default, or the order date as an option;
  - Shopify Protect-covered chargebacks are excluded;
  - Shopify Payments only.
- **Taxes policy**: a fixed amount or a % of Revenue, COGS or Profit, recurring daily, weekly, monthly or one-time, with an optional end date. [DOCUMENTED] PU/june-release-notes
- **Historical COGS policy**: the default COGS applies to a product's whole lifetime; added COGS periods override it for their dates. [DOCUMENTED] SOL/expense-tracking
- **Display policy**: costs are shown as negative values, which does not affect calculations. [DOCUMENTED] PU/august-trueupdate-whats-new-in-trueprofit
- **Time-range policy**: the range persists across reports, with an include/exclude-today toggle. [DOCUMENTED] PU/a-more-focused-dashboard-and-smoother-reporting
- **Currency and time zone policy**: inherited from Shopify store settings. [DOCUMENTED] SOL/profit-dashboard
- **Yotpo spend** is included in Total Ad Spend. [DOCUMENTED] PU/yotpo-x-trueprofit-sms-email-marketing-meets-profit-tracking
- **AutoDS COGS** is included in COGS and profit. [DOCUMENTED] PU/from-autods-to-trueprofit-your-costs-automatically-synced
- **Performance chart** uses a single Y-axis scale. [DOCUMENTED] PU/trueprofit-dashboard-fresh-look
- Marketing accuracy claims ("99% accurate" versus 65% for Triple Whale and 60% for Lifetimely) have no stated method. [DOCUMENTED claim] WHY

---

## 3. Image URLs that depict app UI

Host notes:
- Images on `be.trueprofit.io` could **not** be downloaded: the session's egress proxy returned 403 for that host, and per policy this was not worked around.
- Only images served from `trueprofit.io` itself were downloadable.
- Descriptions of images that were not downloaded are inferred from alt text, filenames and captions.

### Downloaded reference images

Saved locally for internal reference (not committed to the public repo):

| File | Source URL | Shows |
|---|---|---|
| tp-dashboard-kpis-performance-cost-breakdown.webp | https://trueprofit.io/landing/dashboard.webp (WHY) | Full dashboard mock, 3240×1521: date range, compare period, 5 KPI cards, Performance bar/line chart (Daily), Cost Breakdown donut with legend |
| tp-dashboard-kpi-grid-cost-breakdown-donut.webp | https://trueprofit.io/_next/static/media/monitor.2eb1477b.webp (WHY) | KPI grid with % deltas (Revenue, Orders, Net Profit, NPM, Total Costs, COGS) and Cost Breakdown donut including Taxes Paid |
| tp-attribution-most-profitable-ads-and-products.webp | https://trueprofit.io/_next/static/media/scale.9b1c07c8.webp (WHY) | "Most Profitable Ads" table (Assisted / Last-clicked / Net Profit / NPOAS) and "Most Profitable Products" card |
| tp-cost-settings-dimensions-and-integrations.webp | https://trueprofit.io/_next/static/media/cogs.bdfc9934.webp (WHY) | Cost-setting dimensions (COGS by SKU/Bundle/Country; Shipping by Quantity/Weight/Country; Transaction Fees, Custom Costs) and integration groups |

Not saved, because they are not app UI:
- https://trueprofit.io/_next/static/media/MCP.d88dee1c.webp: MCP diagram
- https://trueprofit.io/_next/static/media/netprofit.7b296f37.webp: revenue-to-net-profit waterfall concept graphic
- https://trueprofit.io/_next/static/media/reports.69549ceb.webp: Shopify admin Reports, not TrueProfit
- https://trueprofit.io/_next/static/media/app.5319675c.webp: "#1 TrueProfit" ranking graphic

### Product-update screenshots (be.trueprofit.io, blocked)

All URLs below start with `https://be.trueprofit.io/uploads/`.

- `Dashboard-1-1.webp`: Jun 2026 dashboard top section with the Net Profit hero (PU/a-more-focused-dashboard-and-smoother-reporting)
- `Dashboard-2.webp`: "Add metrics" / "Create custom metric" entry points (same page)
- `time-range.webp`: time-range picker with the include-today option (same page)
- `chargeback-metrics.webp`: Chargeback Loss / Fee metrics on the dashboard (PU/better-tracking-for-shopify-chargebacks-is-here)
- `chargeback-calculate-preferences.webp`: recording-date preference (Resolution vs Order date) (same page)
- `gif-extract-cost-1.gif`: animated Extract Bill with AI flow (PU/faster-cost-tracking-ai-powered-import-is-back)
- `transaction-fee-ui.webp`: redesigned Transaction Fees setup page (PU/transaction-fees-revamped-what-changed-why-it-matters)
- `payment-gateways.webp`: detected gateways plus PayPal/Stripe connect (same page)
- `Custom-cost.webp`: Custom Cost v3 unified setup (PU/a-new-level-of-customization-custom-revenue-upgraded-custom-cost)
- `202511261003.webm`: video demo of the Custom Metrics builder (PU/track-the-metrics-you-need-custom-metrics-is-here)
- `autods-order.webp`: Orders Report showing AutoDS-synced costs (PU/from-autods-to-trueprofit-your-costs-automatically-synced)
- `POD-integration.webp`: POD integrations screen (PU/now-live-trueprofit-integrates-with-printify-printful-gelato)
- `New-Performance-Chart.png`: revamped Performance Chart, alt "Revamped Performance Chart" (PU/trueprofit-dashboard-fresh-look)
- `Orders-vs.-Ad-Spend-Per-Order-Chart.png`: Orders vs Ad Spend Per Order chart (same page)
- `shipping-cost-UI.png`: redesigned Shipping Cost settings (PU/october-trueupdate-whats-new-in-trueprofit)
- `bulk-edit.png`: COGS bulk edit (same page)
- `x-channel-integration.png`: Marketing Channels page with the X Connect row (PU/april-trueupdate-whats-new-in-trueprofit-v6-7)
- `french-language-release.png`: language switcher (same page)
- `Aug-blog-1.png`: Product Analytics report with the new columns (PU/august-trueupdate-whats-new-in-trueprofit)
- `Aug-blog-2.png`: Parameter Generator Chrome extension (same page)
- `Frame-1000007719.png`: negative cost display and notifications panel, likely (same page)
- `Frame-1000007241aa.jpg`: Product Analytics v2 (PU/june-release-notes)
- `Frame-1000007240.jpg`: Taxes Payment setup, alt "Taxes Payment Setups" (same page)
- `Overall-1.webm`, `Chart-focus.webm`: mobile app redesign videos (PU/new-version-new-vibes-trueprofit-mobile-gets-smoother-and-smarter)
- `mcp-instant-answer.png`, `mcp-custom-report.png`, `mcp-spot-trends-1.png`: AI chat outputs using TrueProfit MCP (PU/trueprofit-mcp-turn-ai-into-your-second-finance-brain)

### Solution and use-case page images (be.trueprofit.io, blocked)

All URLs below start with `https://be.trueprofit.io/uploads/`.

- `DB-compress-3.svg`, `dashboard-profit.webp`, `Feature-1-1.svg` … `Feature-4.svg` (mobile versions `Feature-1-min.png` … `Feature-4-min.png`): dashboard KPI table, cost charts, ad channels, trend line graph (SOL/profit-dashboard)
- `3xTemplate-scaled.webp`: Product Analytics hero; `Group-1171278906.svg`: product-level net profit; `Group-1171278907.svg`: product funnel insights (SOL/product-analytics)
- `Group-1171278985-1.webp`: attribution hero; `ads-1.svg`: Last-clicked/Assisted ad table; `conversion_journey-1.svg`: customer journey; `total_ad_spend-1.svg` (SOL/marketing-attribution)
- `dashboard-PL-1.svg`: P&L report hero; `finance.webp`: P&L breakdown; `revenue-1.svg`: historical trend; `ads_channel.webp`; `multiple_stores.webp`: store switcher (SOL/pnl-profit-and-loss)
- `TRACK-expense.webp`, `track_of_cogs.webp`: COGS settings; `monitor_shipping.webp`: shipping settings; `Factor-in-all-the-hidden-fees-you-might-overlook.webp`; `AI-cost-detail-1.webp`: AI bill extractor detail popup; `Screenshot-2026-08-17-at-16.02.56.png`: og image (SOL/expense-tracking)
- `dashboar_CLV-1.svg`: CLV dashboard hero; `all-time-overview.webp`: LTV all-time overview (SOL/customer-lifetime-value)
- `Group-1171275924-4.png`: ad spend by channel and per product (UC/ad-tracking); `Group-1171275951.png`: product analytics (UC/profit-optimization); `hero-profit-tracking-1.png`, `Group-1171275721.svg`: P&L snapshot; `Mopbile.png`: mobile app (UC/profit-tracking)
- `123-1-1.png`: mobile app screens (CMP/trueprofit-vs-lifetimely); `Ad-Attribution-That-Gets-Closer-To-The-Truth.png`: attribution UI (CMP/trueprofit-vs-triple-whale); `track-profit.webp`, `Take-Cost-Tracking-to-Another-Level.webp`, `Put-Your-Data-to-Work-with-AI.webp` (CMP/trueprofit-vs-beprofit)

---

## 4. Gaps and inconsistencies

- Custom Revenue: only the URL slug mentions it; the page content does not describe it.
- Orders Report columns: not listed anywhere public.
- The exact P&L row order is not given, apart from chargeback lines sitting before the profit lines and the general list revenue, COGS, gross profit, operating expenses, net profit.
- Plan gating conflicts between pages:
  - Product Analytics: Basic (WHY) vs Advanced (SOL/product-analytics; Triple Whale comparison).
  - Marketing Attribution: Ultimate (WHY) vs Enterprise (Triple Whale comparison copy).
- Supported-language list: only French is announced.
- Ad Sync Custom Rules: the behaviour is not described.
