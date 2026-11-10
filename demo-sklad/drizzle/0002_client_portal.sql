ALTER TABLE "counterparties" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "portal_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "portal_viewed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_portal_token_uq" ON "counterparties" USING btree ("portal_token");