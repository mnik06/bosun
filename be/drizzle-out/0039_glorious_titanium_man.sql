ALTER TABLE "repositories" ADD COLUMN "config" text;--> statement-breakpoint
ALTER TABLE "repositories" DROP COLUMN "config_draft";--> statement-breakpoint
ALTER TABLE "repositories" DROP COLUMN "config_on_default";