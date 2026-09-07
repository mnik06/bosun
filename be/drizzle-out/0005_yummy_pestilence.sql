CREATE TABLE "queue_items" (
	"id" text PRIMARY KEY NOT NULL,
	"queue_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"branch" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"pr_url" text,
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "queue_items_queue_plan_key" UNIQUE("queue_id","plan_id")
);
--> statement-breakpoint
CREATE TABLE "queues" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"worktree_path" text,
	"base_ref" text,
	"afk" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queues_machine_slug_key" UNIQUE("machine_id","slug")
);
--> statement-breakpoint
CREATE TABLE "slice_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue_item_id" text NOT NULL,
	"slice_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"commit_sha" text,
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_items" ADD CONSTRAINT "queue_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queues" ADD CONSTRAINT "queues_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD CONSTRAINT "slice_runs_queue_item_id_queue_items_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."queue_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_runs" ADD CONSTRAINT "slice_runs_slice_id_slices_id_fk" FOREIGN KEY ("slice_id") REFERENCES "public"."slices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_items_queue_id_idx" ON "queue_items" USING btree ("queue_id");--> statement-breakpoint
CREATE INDEX "queues_user_id_idx" ON "queues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "slice_runs_queue_item_id_idx" ON "slice_runs" USING btree ("queue_item_id");