ALTER TABLE "onboarding_runs" ADD COLUMN "suggested_base_branch" text;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD COLUMN "suggested_base_branch_reason" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "default_branch_override" text;