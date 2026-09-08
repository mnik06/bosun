ALTER TABLE "acs" ADD COLUMN "implemented" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "acs" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "verify_in_ui" boolean DEFAULT true NOT NULL;