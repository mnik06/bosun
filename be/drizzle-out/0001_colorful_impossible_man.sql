CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"sub_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_subId_unique" UNIQUE("sub_id")
);
--> statement-breakpoint
-- Hand-added: the constraint crosses into Supabase's `auth` schema, which
-- drizzle-kit does not introspect and will never generate. Deleting the account
-- in Supabase has to take our row with it, so this cannot live in application code.
ALTER TABLE "users" ADD CONSTRAINT "users_sub_id_auth_users_id_fk"
	FOREIGN KEY ("sub_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
