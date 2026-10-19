ALTER TABLE "ad_connection" ADD COLUMN "auth_type" text DEFAULT 'oauth' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_connection" ADD COLUMN "credentials_enc" text;--> statement-breakpoint
ALTER TABLE "ad_connection" ADD COLUMN "login_customer_id" text;--> statement-breakpoint
ALTER TABLE "ad_account" ADD COLUMN "account_status" text;--> statement-breakpoint
ALTER TABLE "ad_account" ADD COLUMN "spend_synced_through" date;--> statement-breakpoint
ALTER TABLE "ad_account" ADD COLUMN "backfill_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_account" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_account" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "ad_spend_daily" ADD COLUMN "is_adjustment" boolean DEFAULT false NOT NULL;