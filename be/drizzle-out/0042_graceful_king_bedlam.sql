ALTER TABLE "repositories" ADD COLUMN "instructions_by" text;--> statement-breakpoint
UPDATE "repositories" SET "instructions_by" = 'bosun' WHERE "instructions" IS NOT NULL AND "instructions" = "config_compiled_from";
