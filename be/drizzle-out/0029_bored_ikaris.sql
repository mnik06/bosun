ALTER TABLE "notifications" ADD COLUMN "quick_fix_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_quick_fix_id_quick_fixes_id_fk" FOREIGN KEY ("quick_fix_id") REFERENCES "public"."quick_fixes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_quick_fix_id_idx" ON "notifications" USING btree ("quick_fix_id");