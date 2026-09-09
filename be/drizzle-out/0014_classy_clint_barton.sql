ALTER TABLE "plans" DROP CONSTRAINT "plans_user_number_key";--> statement-breakpoint
ALTER TABLE "machines" DROP CONSTRAINT "machines_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "queues" DROP CONSTRAINT "queues_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "machines_user_id_idx";--> statement-breakpoint
DROP INDEX "plans_user_id_idx";--> statement-breakpoint
DROP INDEX "queues_user_id_idx";--> statement-breakpoint
ALTER TABLE "machines" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "queues" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "machines_project_id_idx" ON "machines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plans_project_id_idx" ON "plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "queues_project_id_idx" ON "queues" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "machines" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "queues" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_number_key" UNIQUE("project_id","number");