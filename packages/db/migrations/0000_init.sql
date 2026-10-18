CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."store_status" AS ENUM('pending', 'active', 'disconnected', 'uninstalled');--> statement-breakpoint
CREATE TYPE "public"."ad_platform" AS ENUM('google_ads', 'meta', 'tiktok', 'manual');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'needs_reauth', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."cost_source" AS ENUM('shopify_sync', 'manual', 'csv_import', 'supplier', 'bulk_edit');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('actual', 'rule', 'manual', 'estimated', 'missing');--> statement-breakpoint
CREATE TYPE "public"."restock_type" AS ENUM('RETURN', 'CANCEL', 'NO_RESTOCK', 'LEGACY_RESTOCK');--> statement-breakpoint
CREATE TYPE "public"."sale_action_type" AS ENUM('ORDER', 'RETURN', 'UPDATE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."sale_line_type" AS ENUM('PRODUCT', 'SHIPPING', 'TIP', 'GIFT_CARD', 'DUTY', 'FEE', 'ADDITIONAL_FEE', 'ADJUSTMENT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."cost_component" AS ENUM('cogs', 'shipping', 'handling', 'transaction_fees');--> statement-breakpoint
CREATE TYPE "public"."expense_allocation" AS ENUM('spread', 'on_date');--> statement-breakpoint
CREATE TYPE "public"."expense_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."expense_type" AS ENUM('one_time', 'recurring', 'per_order', 'percent_of_revenue', 'percent_of_net_sales', 'percent_of_ad_spend');--> statement-breakpoint
CREATE TYPE "public"."shipping_rule_type" AS ENUM('per_order', 'per_item', 'first_plus_additional', 'tiered_quantity');--> statement-breakpoint
CREATE TYPE "public"."ad_spend_level" AS ENUM('account', 'campaign', 'ad_group');--> statement-breakpoint
CREATE TYPE "public"."ad_spend_source" AS ENUM('api', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_org_user_uq" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"reporting_currency" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform" text DEFAULT 'shopify' NOT NULL,
	"shop_domain" text NOT NULL,
	"shop_gid" text,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"iana_timezone" text NOT NULL,
	"shopify_plan" text,
	"has_shopify_payments" boolean,
	"third_party_fee_rate" numeric(12, 6),
	"status" "store_status" DEFAULT 'pending' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"installed_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_shop_domain_unique" UNIQUE("shop_domain")
);
--> statement-breakpoint
CREATE TABLE "ad_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"external_user_id" text,
	"display_name" text,
	"refresh_token_enc" text,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scopes" text,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_connection_org_platform_user_uq" UNIQUE("organization_id","platform","external_user_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"provider" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"code_verifier_enc" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_state_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
CREATE TABLE "shopify_app" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"label" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"distribution" text NOT NULL,
	"scopes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_app_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "store_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopify_app_id" uuid NOT NULL,
	"access_token_enc" text NOT NULL,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_enc" text,
	"refresh_token_expires_at" timestamp with time zone,
	"granted_scopes" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_connection_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"title" text NOT NULL,
	"status" text,
	"product_type" text,
	"vendor" text,
	"shopify_updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"inventory_item_gid" text,
	"title" text NOT NULL,
	"sku" text,
	"price" numeric(20, 6),
	"shopify_unit_cost" numeric(20, 6),
	"weight_grams" integer,
	"requires_shipping" boolean,
	"shopify_updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "variant_cost_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"currency" char(3) NOT NULL,
	"product_cost" numeric(20, 6) NOT NULL,
	"inbound_shipping" numeric(20, 6) DEFAULT '0' NOT NULL,
	"handling" numeric(20, 6) DEFAULT '0' NOT NULL,
	"source" "cost_source" NOT NULL,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"country_code" char(2),
	"first_order_at" timestamp with time zone,
	"first_order_local_date" date,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid,
	"shopify_gid" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"amount" numeric(20, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"fee" numeric(20, 6),
	"initiated_at" timestamp with time zone,
	"finalized_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "fulfillment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"status" text NOT NULL,
	"created_at_shopify" timestamp with time zone NOT NULL,
	"tracking_company" text,
	CONSTRAINT "fulfillment_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid,
	"created_at_shopify" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone NOT NULL,
	"processed_local_date" date NOT NULL,
	"cancelled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"test" boolean DEFAULT false NOT NULL,
	"financial_status" text,
	"fulfillment_status" text,
	"currency" char(3) NOT NULL,
	"presentment_currency" char(3),
	"source_name" text,
	"sales_channel" text,
	"shipping_country_code" char(2),
	"landing_site" text,
	"referring_site" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"tags" text[],
	"subtotal_price" numeric(20, 6),
	"total_discounts" numeric(20, 6),
	"total_shipping_price" numeric(20, 6),
	"total_tax" numeric(20, 6),
	"total_tip" numeric(20, 6),
	"total_price" numeric(20, 6),
	"total_refunded" numeric(20, 6),
	"current_total_price" numeric(20, 6),
	"taxes_included" boolean,
	"shopify_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "order_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"variant_id" uuid,
	"variant_gid" text,
	"product_gid" text,
	"title" text NOT NULL,
	"variant_title" text,
	"sku" text,
	"quantity" integer NOT NULL,
	"current_quantity" integer NOT NULL,
	"unfulfilled_quantity" integer,
	"original_unit_price" numeric(20, 6) NOT NULL,
	"is_gift_card" boolean DEFAULT false NOT NULL,
	"requires_shipping" boolean DEFAULT true NOT NULL,
	CONSTRAINT "oli_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "payment_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"parent_gid" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"gateway" text,
	"manual_payment_gateway" boolean DEFAULT false NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_local_date" date,
	"fee_amount" numeric(20, 6),
	"fee_tax_amount" numeric(20, 6),
	"fee_rate" numeric(12, 6),
	"fee_flat" numeric(20, 6),
	CONSTRAINT "ptx_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"created_at_shopify" timestamp with time zone NOT NULL,
	"total_refunded" numeric(20, 6),
	"note" text,
	CONSTRAINT "refund_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "refund_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"refund_id" uuid NOT NULL,
	"shopify_gid" text NOT NULL,
	"line_item_gid" text NOT NULL,
	"quantity" integer NOT NULL,
	"restock_type" "restock_type" NOT NULL,
	"restocked" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(20, 6),
	"total_tax" numeric(20, 6),
	CONSTRAINT "rli_store_gid_uq" UNIQUE("store_id","shopify_gid")
);
--> statement-breakpoint
CREATE TABLE "sale_ledger_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"sale_gid" text NOT NULL,
	"agreement_gid" text NOT NULL,
	"agreement_type" text NOT NULL,
	"agreement_reason" text,
	"refund_gid" text,
	"happened_at" timestamp with time zone NOT NULL,
	"happened_local_date" date NOT NULL,
	"action_type" "sale_action_type" NOT NULL,
	"line_type" "sale_line_type" NOT NULL,
	"line_item_gid" text,
	"quantity" integer,
	"total_amount" numeric(20, 6) NOT NULL,
	"total_discount_before_taxes" numeric(20, 6) NOT NULL,
	"total_discount_after_taxes" numeric(20, 6) NOT NULL,
	"total_tax_amount" numeric(20, 6) NOT NULL,
	CONSTRAINT "sle_store_sale_gid_uq" UNIQUE("store_id","sale_gid")
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid,
	"category_id" uuid,
	"name" text NOT NULL,
	"type" "expense_type" NOT NULL,
	"frequency" "expense_frequency",
	"allocation" "expense_allocation" DEFAULT 'spread' NOT NULL,
	"amount" numeric(20, 6),
	"percent" numeric(12, 6),
	"currency" char(3) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_ad_spend" boolean DEFAULT false NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_marketing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_category_org_name_uq" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "financial_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_policy_store_version_uq" UNIQUE("store_id","version")
);
--> statement-breakpoint
CREATE TABLE "gateway_fee_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"percent_rate" numeric(12, 6) NOT NULL,
	"fixed_fee" numeric(20, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"third_party_fee_applies" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handling_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_cost_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"component" "cost_component" NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"reason" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by_user_id" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "shipping_rule_type" NOT NULL,
	"country_codes" text[],
	"priority" integer DEFAULT 100 NOT NULL,
	"params" jsonb NOT NULL,
	"currency" char(3) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid,
	"platform" "ad_platform" NOT NULL,
	"external_id" text NOT NULL,
	"login_customer_id" text,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"timezone" text NOT NULL,
	"is_manager" boolean DEFAULT false NOT NULL,
	"store_id" uuid,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_account_org_platform_ext_uq" UNIQUE("organization_id","platform","external_id")
);
--> statement-breakpoint
CREATE TABLE "ad_campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"channel_type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_campaign_account_ext_uq" UNIQUE("ad_account_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "ad_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_campaign_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_group_campaign_ext_uq" UNIQUE("ad_campaign_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "ad_spend_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"level" "ad_spend_level" NOT NULL,
	"entity_external_id" text NOT NULL,
	"date" date NOT NULL,
	"source" "ad_spend_source" NOT NULL,
	"spend" numeric(20, 6) NOT NULL,
	"impressions" bigint,
	"clicks" bigint,
	"conversions" numeric(20, 6),
	"conversion_value" numeric(20, 6),
	"note" text,
	"entered_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_spend_daily_uq" UNIQUE("ad_account_id","level","entity_external_id","date","source")
);
--> statement-breakpoint
CREATE TABLE "daily_store_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"currency" char(3) NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"gross_sales" numeric(20, 6) DEFAULT '0' NOT NULL,
	"discounts" numeric(20, 6) DEFAULT '0' NOT NULL,
	"returns" numeric(20, 6) DEFAULT '0' NOT NULL,
	"shipping_charged" numeric(20, 6) DEFAULT '0' NOT NULL,
	"tips" numeric(20, 6) DEFAULT '0' NOT NULL,
	"adjustments" numeric(20, 6) DEFAULT '0' NOT NULL,
	"duties_and_fees" numeric(20, 6) DEFAULT '0' NOT NULL,
	"taxes" numeric(20, 6) DEFAULT '0' NOT NULL,
	"gift_card_sales" numeric(20, 6) DEFAULT '0' NOT NULL,
	"revenue" numeric(20, 6) DEFAULT '0' NOT NULL,
	"cogs" numeric(20, 6) DEFAULT '0' NOT NULL,
	"shipping_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"handling_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"transaction_fees" numeric(20, 6) DEFAULT '0' NOT NULL,
	"chargeback_loss" numeric(20, 6) DEFAULT '0' NOT NULL,
	"chargeback_fees" numeric(20, 6) DEFAULT '0' NOT NULL,
	"ad_spend" numeric(20, 6) DEFAULT '0' NOT NULL,
	"variable_expenses" numeric(20, 6) DEFAULT '0' NOT NULL,
	"ad_linked_expenses" numeric(20, 6) DEFAULT '0' NOT NULL,
	"fixed_expenses" numeric(20, 6) DEFAULT '0' NOT NULL,
	"marketing_expenses" numeric(20, 6) DEFAULT '0' NOT NULL,
	"orders_missing_cogs" integer DEFAULT 0 NOT NULL,
	"revenue_missing_cogs" numeric(20, 6) DEFAULT '0' NOT NULL,
	"orders_missing_shipping" integer DEFAULT 0 NOT NULL,
	"fees_estimated_amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	"transactions_missing_fees" integer DEFAULT 0 NOT NULL,
	"fx_issues" integer DEFAULT 0 NOT NULL,
	"unclassified_sales_amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_store_metrics_store_date_uq" UNIQUE("store_id","local_date")
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"date" date NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(24, 12) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE "order_profit" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"revenue" numeric(20, 6) NOT NULL,
	"cogs" numeric(20, 6) NOT NULL,
	"shipping_cost" numeric(20, 6) NOT NULL,
	"handling_cost" numeric(20, 6) NOT NULL,
	"transaction_fees" numeric(20, 6) NOT NULL,
	"contribution_before_ads" numeric(20, 6) NOT NULL,
	"profit" numeric(20, 6) NOT NULL,
	"is_complete" boolean NOT NULL,
	"missing_components" text[] NOT NULL,
	"estimated_components" text[] NOT NULL,
	"trace" jsonb NOT NULL,
	"engine_version" text NOT NULL,
	"policy_version" integer NOT NULL,
	"inputs_hash" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid,
	"actor_user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"metric" text NOT NULL,
	"expected" numeric(20, 6) NOT NULL,
	"actual" numeric(20, 6) NOT NULL,
	"difference" numeric(20, 6) NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "sync_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid,
	"kind" text NOT NULL,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"cursor" jsonb,
	"progress" jsonb,
	"stats" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"provider" text DEFAULT 'shopify' NOT NULL,
	"external_id" text NOT NULL,
	"topic" text NOT NULL,
	"shop_domain" text,
	"payload_sha256" text NOT NULL,
	"resource_gid" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'received' NOT NULL,
	CONSTRAINT "webhook_event_provider_ext_uq" UNIQUE("provider","external_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store" ADD CONSTRAINT "store_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_connection" ADD CONSTRAINT "ad_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_state" ADD CONSTRAINT "oauth_state_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_app" ADD CONSTRAINT "shopify_app_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connection" ADD CONSTRAINT "store_connection_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_connection" ADD CONSTRAINT "store_connection_shopify_app_id_shopify_app_id_fk" FOREIGN KEY ("shopify_app_id") REFERENCES "public"."shopify_app"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_cost_version" ADD CONSTRAINT "variant_cost_version_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_cost_version" ADD CONSTRAINT "variant_cost_version_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_cost_version" ADD CONSTRAINT "variant_cost_version_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment" ADD CONSTRAINT "fulfillment_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_line_item" ADD CONSTRAINT "refund_line_item_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_line_item" ADD CONSTRAINT "refund_line_item_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_ledger_entry" ADD CONSTRAINT "sale_ledger_entry_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_ledger_entry" ADD CONSTRAINT "sale_ledger_entry_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_category_id_expense_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_category" ADD CONSTRAINT "expense_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_policy" ADD CONSTRAINT "financial_policy_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_policy" ADD CONSTRAINT "financial_policy_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_fee_rule" ADD CONSTRAINT "gateway_fee_rule_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handling_rule" ADD CONSTRAINT "handling_rule_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_override" ADD CONSTRAINT "order_cost_override_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_override" ADD CONSTRAINT "order_cost_override_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cost_override" ADD CONSTRAINT "order_cost_override_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rule" ADD CONSTRAINT "shipping_rule_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_connection_id_ad_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ad_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign" ADD CONSTRAINT "ad_campaign_ad_account_id_ad_account_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_group" ADD CONSTRAINT "ad_group_ad_campaign_id_ad_campaign_id_fk" FOREIGN KEY ("ad_campaign_id") REFERENCES "public"."ad_campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_ad_account_id_ad_account_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend_daily" ADD CONSTRAINT "ad_spend_daily_entered_by_user_id_user_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_store_metrics" ADD CONSTRAINT "daily_store_metrics_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_profit" ADD CONSTRAINT "order_profit_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_profit" ADD CONSTRAINT "order_profit_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_issue" ADD CONSTRAINT "reconciliation_issue_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD CONSTRAINT "webhook_event_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "store_org_idx" ON "store" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "oauth_state_expires_idx" ON "oauth_state" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "variant_product_idx" ON "variant" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variant_sku_idx" ON "variant" USING btree ("store_id","sku");--> statement-breakpoint
CREATE INDEX "vcv_variant_from_idx" ON "variant_cost_version" USING btree ("variant_id","effective_from");--> statement-breakpoint
CREATE INDEX "customer_first_order_idx" ON "customer" USING btree ("store_id","first_order_local_date");--> statement-breakpoint
CREATE INDEX "dispute_order_idx" ON "dispute" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "fulfillment_order_idx" ON "fulfillment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_store_processed_date_idx" ON "order" USING btree ("store_id","processed_local_date");--> statement-breakpoint
CREATE INDEX "order_store_updated_idx" ON "order" USING btree ("store_id","shopify_updated_at");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "order" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "oli_order_idx" ON "order_line_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "oli_variant_idx" ON "order_line_item" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "ptx_order_idx" ON "payment_transaction" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_order_idx" ON "refund" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rli_refund_idx" ON "refund_line_item" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "sle_store_date_idx" ON "sale_ledger_entry" USING btree ("store_id","happened_local_date");--> statement-breakpoint
CREATE INDEX "sle_order_idx" ON "sale_ledger_entry" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "expense_store_idx" ON "expense" USING btree ("store_id","start_date");--> statement-breakpoint
CREATE INDEX "expense_org_idx" ON "expense" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gateway_fee_rule_store_idx" ON "gateway_fee_rule" USING btree ("store_id","gateway","effective_from");--> statement-breakpoint
CREATE INDEX "handling_rule_store_idx" ON "handling_rule" USING btree ("store_id","effective_from");--> statement-breakpoint
CREATE INDEX "order_cost_override_order_idx" ON "order_cost_override" USING btree ("order_id","component");--> statement-breakpoint
CREATE INDEX "shipping_rule_store_idx" ON "shipping_rule" USING btree ("store_id","effective_from");--> statement-breakpoint
CREATE INDEX "ad_account_store_idx" ON "ad_account" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "ad_spend_daily_account_date_idx" ON "ad_spend_daily" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "reconciliation_issue_store_date_idx" ON "reconciliation_issue" USING btree ("store_id","local_date");--> statement-breakpoint
CREATE INDEX "sync_job_store_kind_idx" ON "sync_job" USING btree ("store_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "webhook_event_store_idx" ON "webhook_event" USING btree ("store_id","received_at");