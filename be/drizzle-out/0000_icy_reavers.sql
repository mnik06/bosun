CREATE TABLE "machines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enrollment_token" text,
	"token_expires_at" timestamp with time zone,
	"token_used_at" timestamp with time zone,
	"machine_key_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"repo_path" text,
	"agent_version" text,
	"capabilities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machines_enrollmentToken_unique" UNIQUE("enrollment_token")
);
