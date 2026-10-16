ALTER TABLE "onboarding_runs" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "config_compiled_from" text;