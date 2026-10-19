CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "order_name_trgm_idx" ON "order" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oli_title_trgm_idx" ON "order_line_item" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "oli_sku_trgm_idx" ON "order_line_item" USING gin ("sku" gin_trgm_ops);