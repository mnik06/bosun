ALTER TABLE "slice_runs" DROP CONSTRAINT "slice_runs_queue_item_id_queue_items_id_fk";
--> statement-breakpoint
DROP INDEX "slice_runs_queue_item_id_idx";--> statement-breakpoint
ALTER TABLE "plan_blockers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "queue_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "queue_messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "queues" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "plan_blockers" CASCADE;--> statement-breakpoint
DROP TABLE "queue_items" CASCADE;--> statement-breakpoint
DROP TABLE "queue_messages" CASCADE;--> statement-breakpoint
DROP TABLE "queues" CASCADE;--> statement-breakpoint
ALTER TABLE "slice_runs" ALTER COLUMN "build_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "plans_repository_id_idx" ON "plans" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "slice_runs_build_id_idx" ON "slice_runs" USING btree ("build_id");--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "auto";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "confirmed_at";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "prepares_plan_ids";--> statement-breakpoint
ALTER TABLE "slice_runs" DROP COLUMN "queue_item_id";