CREATE TABLE "github_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_project_installation_key" UNIQUE("project_id","installation_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"phase" text NOT NULL,
	"status" text NOT NULL,
	"port_base" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" text,
	"failure_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"default_branch" text NOT NULL,
	"config_draft" text,
	"config_on_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_project_github_repo_key" UNIQUE("project_id","github_repo_id")
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "repository_id" text;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "public_key" text;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "policy" jsonb DEFAULT '{"applyMigrations":true,"confirmed":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "session_secrets" jsonb;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_runs" ADD CONSTRAINT "onboarding_runs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_github_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_runs_repository_id_idx" ON "onboarding_runs" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "onboarding_runs_machine_id_idx" ON "onboarding_runs" USING btree ("machine_id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;