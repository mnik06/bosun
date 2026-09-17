CREATE TABLE "github_pat_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"github_login" text NOT NULL,
	"token_type" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"broken_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "github_pat_connection_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "webhook_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "github_webhook_id" bigint;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "sync_mode" text;--> statement-breakpoint
ALTER TABLE "github_pat_connections" ADD CONSTRAINT "github_pat_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_pat_connections" ADD CONSTRAINT "github_pat_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_github_pat_connection_id_github_pat_connections_id_fk" FOREIGN KEY ("github_pat_connection_id") REFERENCES "public"."github_pat_connections"("id") ON DELETE cascade ON UPDATE no action;