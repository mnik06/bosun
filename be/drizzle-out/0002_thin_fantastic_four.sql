-- Hand-added: `user_id` is NOT NULL, and there is no owner to backfill for rows
-- created before accounts existed. They are plan 001 test rows, and inventing an
-- owner would leave data whose provenance is a guess. The delete has to run in
-- the same migration as the constraint, or the ALTER below fails on them.
DELETE FROM "machines";
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "machines_user_id_idx" ON "machines" USING btree ("user_id");
