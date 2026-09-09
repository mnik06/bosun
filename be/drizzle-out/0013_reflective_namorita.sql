CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_app_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_members_user_id_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-added: `project_id` is filled here, in the migration that adds it, because
-- 0014 makes it NOT NULL and would fail on every pre-existing row. Each user
-- becomes the leader of a project of their own, and their machines, plans and
-- queues move to it. The project id is derived from the user id rather than
-- generated so the three UPDATEs below can find it without a temporary column.
INSERT INTO "projects" ("id", "name")
SELECT 'prj_' || substr(u."id", 3), split_part(u."email", '@', 1) FROM "users" u;--> statement-breakpoint
INSERT INTO "project_members" ("project_id", "user_id", "role")
SELECT 'prj_' || substr(u."id", 3), u."id", 'leader' FROM "users" u;--> statement-breakpoint
UPDATE "machines" SET "project_id" = 'prj_' || substr("user_id", 3);--> statement-breakpoint
UPDATE "plans" SET "project_id" = 'prj_' || substr("user_id", 3), "created_by_user_id" = "user_id";--> statement-breakpoint
UPDATE "queues" SET "project_id" = 'prj_' || substr("user_id", 3);
