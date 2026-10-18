-- Integrity constraints that drizzle-kit cannot express (FINANCIAL_MODEL §5, ARCHITECTURE §4).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Cost versions: valid interval and no overlapping periods per variant.
ALTER TABLE "variant_cost_version"
  ADD CONSTRAINT "vcv_interval_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
--> statement-breakpoint
ALTER TABLE "variant_cost_version"
  ADD CONSTRAINT "vcv_no_overlap" EXCLUDE USING gist (
    "variant_id" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  );
--> statement-breakpoint
ALTER TABLE "variant_cost_version"
  ADD CONSTRAINT "vcv_amounts_non_negative" CHECK ("product_cost" >= 0 AND "inbound_shipping" >= 0 AND "handling" >= 0);
--> statement-breakpoint
-- Effective-dated rules: valid intervals.
ALTER TABLE "shipping_rule" ADD CONSTRAINT "shipping_rule_interval_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
--> statement-breakpoint
ALTER TABLE "handling_rule" ADD CONSTRAINT "handling_rule_interval_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
--> statement-breakpoint
ALTER TABLE "handling_rule" ADD CONSTRAINT "handling_rule_mode_valid" CHECK ("mode" IN ('per_order', 'per_item'));
--> statement-breakpoint
ALTER TABLE "gateway_fee_rule" ADD CONSTRAINT "gateway_fee_rule_interval_valid" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
--> statement-breakpoint
ALTER TABLE "gateway_fee_rule"
  ADD CONSTRAINT "gateway_fee_rule_no_overlap" EXCLUDE USING gist (
    "store_id" WITH =,
    "gateway" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  );
--> statement-breakpoint
-- Expenses: fields required by type.
ALTER TABLE "expense" ADD CONSTRAINT "expense_dates_valid" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_fields_by_type" CHECK (
  CASE "type"
    WHEN 'one_time'  THEN "amount" IS NOT NULL AND "percent" IS NULL AND "frequency" IS NULL
    WHEN 'recurring' THEN "amount" IS NOT NULL AND "percent" IS NULL AND "frequency" IS NOT NULL
    WHEN 'per_order' THEN "amount" IS NOT NULL AND "percent" IS NULL AND "frequency" IS NULL
    ELSE "percent" IS NOT NULL AND "amount" IS NULL AND "frequency" IS NULL
  END
);
--> statement-breakpoint
-- Currency codes are upper-case ISO 4217.
ALTER TABLE "store" ADD CONSTRAINT "store_currency_upper" CHECK ("currency" ~ '^[A-Z]{3}$');
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_currency_upper" CHECK ("reporting_currency" ~ '^[A-Z]{3}$');
--> statement-breakpoint
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_positive" CHECK ("rate" > 0);
--> statement-breakpoint
-- Line items and refunds.
ALTER TABLE "order_line_item" ADD CONSTRAINT "oli_quantities_valid" CHECK ("quantity" >= 0 AND "current_quantity" >= 0);
--> statement-breakpoint
ALTER TABLE "refund_line_item" ADD CONSTRAINT "rli_quantity_valid" CHECK ("quantity" >= 0);
--> statement-breakpoint
-- API ad spend is never negative; manual rows may be negative adjustments (flagged in note/UI).
ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_api_non_negative" CHECK ("source" = 'manual' OR "spend" >= 0);
--> statement-breakpoint
-- Store domain shape.
ALTER TABLE "store" ADD CONSTRAINT "store_shop_domain_shape" CHECK ("platform" <> 'shopify' OR "shop_domain" ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$');
--> statement-breakpoint
-- At most one active override per (order, component).
CREATE UNIQUE INDEX "order_cost_override_active_uq" ON "order_cost_override" ("order_id", "component") WHERE "superseded_at" IS NULL;
