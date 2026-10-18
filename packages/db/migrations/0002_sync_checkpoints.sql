ALTER TABLE "store_connection" ADD COLUMN "auth_mode" text DEFAULT 'client_credentials' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "orders_synced_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "products_synced_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "disputes_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "backfill_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "backfill_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_connection" ADD COLUMN "history_start" date;