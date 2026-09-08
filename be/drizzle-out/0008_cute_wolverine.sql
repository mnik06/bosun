CREATE TABLE "queue_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"queue_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_messages" ADD CONSTRAINT "queue_messages_queue_id_queues_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "queue_messages_queue_id_idx" ON "queue_messages" USING btree ("queue_id");