CREATE TABLE "builds" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"machine_id" text,
	"position" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"needs_you_reason" text,
	"branch" text,
	"base_branch" text,
	"worktree_path" text,
	"port_base" integer,
	"pr_number" integer,
	"pr_url" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"built_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"merged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"trigger" text NOT NULL,
	"onto" text NOT NULL,
	"onto_sha" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"merged" boolean DEFAULT false NOT NULL,
	"regenerated" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "overlap_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"provider_plan_id" text NOT NULL,
	"item" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"chosen" text,
	"decided_by_user_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_amendments" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"source_plan_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_dependencies" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"provider_plan_id" text NOT NULL,
	"provider_slice_id" text,
	"source" text NOT NULL,
	"reason" text NOT NULL,
	"overridden_by_user_id" text,
	"overridden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verify_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"run_id" text NOT NULL,
	"ac_code" text,
	"kind" text NOT NULL,
	"reproduction" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"accepted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "verify_lanes" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "build_cap" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "hands_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "repository_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "auto_resolve_conflicts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "build_id" text;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "question_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "answer" jsonb;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "ac_codes" jsonb;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "slices" ADD COLUMN "foundation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slices" ADD COLUMN "footprint" jsonb DEFAULT '{"schema":[],"contracts":[],"modules":[],"consumes":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "slices" ADD COLUMN "changed_files" jsonb;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overlap_decisions" ADD CONSTRAINT "overlap_decisions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overlap_decisions" ADD CONSTRAINT "overlap_decisions_provider_plan_id_plans_id_fk" FOREIGN KEY ("provider_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overlap_decisions" ADD CONSTRAINT "overlap_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_amendments" ADD CONSTRAINT "plan_amendments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_amendments" ADD CONSTRAINT "plan_amendments_source_plan_id_plans_id_fk" FOREIGN KEY ("source_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_provider_plan_id_plans_id_fk" FOREIGN KEY ("provider_plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_provider_slice_id_slices_id_fk" FOREIGN KEY ("provider_slice_id") REFERENCES "public"."slices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dependencies" ADD CONSTRAINT "plan_dependencies_overridden_by_user_id_users_id_fk" FOREIGN KEY ("overridden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_messages" ADD CONSTRAINT "repository_messages_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verify_findings" ADD CONSTRAINT "verify_findings_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verify_findings" ADD CONSTRAINT "verify_findings_run_id_slice_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."slice_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verify_findings" ADD CONSTRAINT "verify_findings_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builds_plan_id_idx" ON "builds" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "builds_repository_id_idx" ON "builds" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "builds_machine_id_idx" ON "builds" USING btree ("machine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "builds_live_plan_key" ON "builds" USING btree ("plan_id") WHERE status not in ('merged', 'cancelled');--> statement-breakpoint
CREATE INDEX "integrations_build_id_idx" ON "integrations" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "overlap_decisions_plan_id_idx" ON "overlap_decisions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_amendments_plan_id_idx" ON "plan_amendments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_dependencies_plan_id_idx" ON "plan_dependencies" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_dependencies_provider_plan_id_idx" ON "plan_dependencies" USING btree ("provider_plan_id");--> statement-breakpoint
CREATE INDEX "repository_messages_repository_id_idx" ON "repository_messages" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "verify_findings_build_id_idx" ON "verify_findings" USING btree ("build_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD CONSTRAINT "slice_runs_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;