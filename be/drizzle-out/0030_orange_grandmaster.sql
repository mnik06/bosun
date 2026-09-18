CREATE TABLE "bugfix_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bugfix_messages_build_seq_key" UNIQUE("build_id","seq")
);
--> statement-breakpoint
CREATE TABLE "bugfix_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"ended_reason" text,
	"started_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_bugs" (
	"id" text PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"seq" integer NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_bugs_build_seq_key" UNIQUE("build_id","seq")
);
--> statement-breakpoint
ALTER TABLE "bugfix_messages" ADD CONSTRAINT "bugfix_messages_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugfix_sessions" ADD CONSTRAINT "bugfix_sessions_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugfix_sessions" ADD CONSTRAINT "bugfix_sessions_started_by_user_id_users_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_bugs" ADD CONSTRAINT "plan_bugs_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bugfix_sessions_running_build_key" ON "bugfix_sessions" USING btree ("build_id") WHERE status = 'running';--> statement-breakpoint
CREATE INDEX "plan_bugs_build_id_idx" ON "plan_bugs" USING btree ("build_id");