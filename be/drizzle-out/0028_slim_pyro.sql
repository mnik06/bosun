CREATE TABLE "azure_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization" text NOT NULL,
	"encrypted_pat" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"broken_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "azure_connections_project_organization_key" UNIQUE("project_id","organization")
);
--> statement-breakpoint
CREATE TABLE "azure_webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"repository_id" text NOT NULL,
	"event_type" text NOT NULL,
	"azure_subscription_id" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "azure_webhook_subscriptions_repository_event_key" UNIQUE("repository_id","event_type")
);
--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "installation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ALTER COLUMN "github_repo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "provider" text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "azure_connection_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "azure_project_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "azure_repo_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "azure_connections" ADD CONSTRAINT "azure_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_connections" ADD CONSTRAINT "azure_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_webhook_subscriptions" ADD CONSTRAINT "azure_webhook_subscriptions_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_azure_connection_id_azure_connections_id_fk" FOREIGN KEY ("azure_connection_id") REFERENCES "public"."azure_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_azure_repo_key" UNIQUE("project_id","azure_repo_id");