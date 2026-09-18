ALTER TABLE "notifications" DROP CONSTRAINT "notifications_quick_fix_id_quick_fixes_id_fk";
--> statement-breakpoint
ALTER TABLE "overlap_decisions" DROP CONSTRAINT "overlap_decisions_decided_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_decisions" DROP CONSTRAINT "plan_decisions_slice_id_slices_id_fk";
--> statement-breakpoint
DROP INDEX "notifications_quick_fix_id_idx";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "quick_fix_id";--> statement-breakpoint
ALTER TABLE "overlap_decisions" DROP COLUMN "decided_by_user_id";--> statement-breakpoint
ALTER TABLE "overlap_decisions" DROP COLUMN "decided_at";--> statement-breakpoint
ALTER TABLE "plan_decisions" DROP COLUMN "slice_id";