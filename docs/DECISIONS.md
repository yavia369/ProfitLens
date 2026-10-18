# Decision Log

Format: ID · date · decision · rationale · status.

| ID | Date | Decision | Rationale | Status |
|---|---|---|---|---|
| D-001 | 2026-10-18 | Build for the owner's own stores first, multi-tenant schema from day one | Owner chose the default; avoids App Store review and `read_all_orders` public-app scrutiny while keeping a SaaS path | Accepted (owner) |
| D-002 | 2026-10-18 | First test store: Luraflo (live, AUD, Australia/Canberra) | Owner instruction | Accepted (owner) |
| D-003 | 2026-10-18 | TrueProfit connector used read-only as a functional reference | Owner authorized | Accepted (owner) |
| D-004 | 2026-10-18 | Release-1 ads: Google Ads + manual spend entry; Meta/TikTok later | Owner chose the default; Google is already used by Luraflo | Accepted (owner) |
| D-005 | 2026-10-18 | Code hosted on GitHub | Owner instruction | Accepted (owner), repo pending |
| D-006 | 2026-10-18 | Shopify: GraphQL Admin API only (pin a stable version, currently 2026-10), authorization code grant with **expiring offline tokens**, Dev Dashboard app with custom distribution per store for M1 | REST is legacy; admin-created custom apps are discontinued; expiring tokens are mandatory for public apps from 2027-01-01; custom distribution fits non-Plus owned stores | Proposed (Phase 2 to confirm) |
| D-007 | 2026-10-18 | Google Ads via REST `googleAds:searchStream` (v26), no community SDK | No official Node library; the community lib lags versions | Proposed |
| D-008 | 2026-10-18 | Decimal money + effective-dated costs + explicit completeness flags | TrueProfit evidence shows float money and silent $0 COGS; financial accuracy is priority #1 | Accepted (brief) |
| D-009 | 2026-10-18 | Original visual identity (light-first + dark mode), not TrueProfit's navy theme | Brief forbids reproducing brand identity | Proposed |
| D-010 | 2026-10-18 | Product name: **ProfitLens** | Owner decision | Accepted (owner) |
| D-011 | 2026-10-18 | Public repo hygiene: no secrets, customer PII, store financial figures, or TrueProfit images/branding are committed | Repository is public | Accepted |
