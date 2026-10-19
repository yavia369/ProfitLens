CREATE TABLE "order_cogs_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"line_item_gid" text,
	"variant_id" uuid,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(20, 6),
	"amount" numeric(20, 6) NOT NULL,
	"status" text NOT NULL,
	"cost_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "order_daily_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"units_sold" integer DEFAULT 0 NOT NULL,
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
	"orders_missing_cogs" integer DEFAULT 0 NOT NULL,
	"revenue_missing_cogs" numeric(20, 6) DEFAULT '0' NOT NULL,
	"orders_missing_shipping" integer DEFAULT 0 NOT NULL,
	"fees_estimated_amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	"transactions_missing_fees" integer DEFAULT 0 NOT NULL,
	"unclassified_sales_amount" numeric(20, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "odr_order_date_uq" UNIQUE("order_id","local_date")
);
--> statement-breakpoint
ALTER TABLE "order_profit" ADD COLUMN "chargebacks" numeric(20, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_profit" ADD COLUMN "included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_profit" ADD COLUMN "exclusion_reason" text;--> statement-breakpoint
ALTER TABLE "order_cogs_line" ADD CONSTRAINT "order_cogs_line_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cogs_line" ADD CONSTRAINT "order_cogs_line_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cogs_line" ADD CONSTRAINT "order_cogs_line_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_daily_result" ADD CONSTRAINT "order_daily_result_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_daily_result" ADD CONSTRAINT "order_daily_result_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ocl_store_date_idx" ON "order_cogs_line" USING btree ("store_id","local_date");--> statement-breakpoint
CREATE INDEX "ocl_order_idx" ON "order_cogs_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ocl_variant_idx" ON "order_cogs_line" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "odr_store_date_idx" ON "order_daily_result" USING btree ("store_id","local_date");