CREATE TABLE "acs" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"code" text NOT NULL,
	"text" text NOT NULL,
	"slice_id" text,
	"ordinal" integer NOT NULL,
	CONSTRAINT "acs_plan_code_key" UNIQUE("plan_id","code")
);
--> statement-breakpoint
CREATE TABLE "plan_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_messages_plan_seq_key" UNIQUE("plan_id","seq")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"title" text,
	"body_md" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"failure_reason" text,
	"input" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slices" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text DEFAULT 'build' NOT NULL,
	"title" text NOT NULL,
	"body_md" text
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "claude_auth_mode" text;--> statement-breakpoint
ALTER TABLE "acs" ADD CONSTRAINT "acs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acs" ADD CONSTRAINT "acs_slice_id_slices_id_fk" FOREIGN KEY ("slice_id") REFERENCES "public"."slices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_messages" ADD CONSTRAINT "plan_messages_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slices" ADD CONSTRAINT "slices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acs_plan_id_idx" ON "acs" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plans_user_id_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plans_machine_id_idx" ON "plans" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "slices_plan_id_idx" ON "slices" USING btree ("plan_id");