CREATE TABLE "plan_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"slice_id" text,
	"fork" text NOT NULL,
	"options" text,
	"chose" text NOT NULL,
	"blast_radius" text,
	"reversing" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "project_profile" jsonb;--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN "port_base" integer;--> statement-breakpoint
UPDATE "queues" SET "port_base" = 4100 + 10 * (ranked.seq - 1) FROM (
	SELECT "id", row_number() OVER (PARTITION BY "machine_id" ORDER BY "created_at", "id") AS seq
	FROM "queues"
) AS ranked WHERE "queues"."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "queues" ALTER COLUMN "port_base" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_decisions" ADD CONSTRAINT "plan_decisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_decisions" ADD CONSTRAINT "plan_decisions_slice_id_slices_id_fk" FOREIGN KEY ("slice_id") REFERENCES "public"."slices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_decisions_plan_id_idx" ON "plan_decisions" USING btree ("plan_id");