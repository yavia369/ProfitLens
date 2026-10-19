CREATE TYPE "public"."gateway_match_status" AS ENUM('matched', 'unmatched', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."payment_gateway" AS ENUM('stripe', 'paypal');--> statement-breakpoint
CREATE TABLE "gateway_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" text NOT NULL,
	"fee" numeric(20, 6) NOT NULL,
	"fee_currency" text NOT NULL,
	"match_status" "gateway_match_status" NOT NULL,
	"match_reason" text,
	"shopify_transaction_gid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_txn_conn_ext_uq" UNIQUE("connection_id","external_id"),
	CONSTRAINT "gateway_txn_store_shopify_uq" UNIQUE("store_id","shopify_transaction_gid")
);
--> statement-breakpoint
CREATE TABLE "payment_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"gateway" "payment_gateway" NOT NULL,
	"display_name" text NOT NULL,
	"credentials_enc" text NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"synced_through" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_connection_store_gateway_uq" UNIQUE("store_id","gateway")
);
--> statement-breakpoint
ALTER TABLE "gateway_transaction" ADD CONSTRAINT "gateway_transaction_connection_id_payment_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."payment_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_transaction" ADD CONSTRAINT "gateway_transaction_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_connection" ADD CONSTRAINT "payment_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_connection" ADD CONSTRAINT "payment_connection_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateway_txn_store_time_idx" ON "gateway_transaction" USING btree ("store_id","occurred_at");