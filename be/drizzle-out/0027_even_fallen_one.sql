ALTER TABLE "notifications" DROP CONSTRAINT "notifications_machine_id_machines_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "machine_id";