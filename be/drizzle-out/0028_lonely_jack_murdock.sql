CREATE TABLE "quick_fixes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"pr_url" text,
	"error" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quick_fixes" ADD CONSTRAINT "quick_fixes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_fixes" ADD CONSTRAINT "quick_fixes_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_fixes" ADD CONSTRAINT "quick_fixes_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_fixes" ADD CONSTRAINT "quick_fixes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quick_fixes_project_id_idx" ON "quick_fixes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quick_fixes_machine_id_idx" ON "quick_fixes" USING btree ("machine_id");