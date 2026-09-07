CREATE TABLE "plan_blockers" (
	"plan_id" text NOT NULL,
	"blocked_by_plan_id" text NOT NULL,
	CONSTRAINT "plan_blockers_plan_id_blocked_by_plan_id_pk" PRIMARY KEY("plan_id","blocked_by_plan_id")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "number" integer;--> statement-breakpoint
UPDATE "plans" SET "number" = numbered.seq FROM (
	SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS seq
	FROM "plans"
) AS numbered WHERE "plans"."id" = numbered."id";--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_blockers" ADD CONSTRAINT "plan_blockers_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_blockers" ADD CONSTRAINT "plan_blockers_blocked_by_plan_id_plans_id_fk" FOREIGN KEY ("blocked_by_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_blockers_blocked_by_idx" ON "plan_blockers" USING btree ("blocked_by_plan_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_number_key" UNIQUE("user_id","number");