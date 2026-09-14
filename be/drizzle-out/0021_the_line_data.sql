-- Queues become builds. Refused while a bullet is running: a session mid-edit has
-- no build to report to once its queue item is gone, and nothing could settle it.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "slice_runs" WHERE "status" = 'running') THEN
		RAISE EXCEPTION 'the line migration refuses to run while a bullet is running — pause every queue and let its bullet settle first';
	END IF;
END $$;
--> statement-breakpoint
UPDATE "plans" SET "approved_at" = "confirmed_at", "hands_off" = "auto";
--> statement-breakpoint
UPDATE "plans" AS p
SET "repository_id" = m."repository_id"
FROM "machines" AS m
WHERE m."id" = p."machine_id" AND p."repository_id" IS NULL;
--> statement-breakpoint
-- One build per plan, from the plan's latest item: a plan queued twice is one line
-- entry, and the older attempt's runs describe work the newer one superseded.
-- Positions follow the order plans were queued in.
INSERT INTO "builds" (
	"id", "plan_id", "repository_id", "machine_id", "position", "status", "branch", "pr_url",
	"failure_reason", "created_at", "started_at", "built_at", "verified_at", "finished_at"
)
SELECT
	'bld_' || substr(latest."id", 4),
	latest."plan_id",
	latest."repository_id",
	latest."machine_id",
	row_number() OVER (PARTITION BY latest."repository_id" ORDER BY latest."queued_at", latest."ordinal")::integer,
	CASE latest."status"
		WHEN 'queued' THEN 'scheduled'
		WHEN 'running' THEN 'held'
		WHEN 'done' THEN 'in_review'
		WHEN 'failed' THEN 'failed'
		ELSE 'cancelled'
	END,
	latest."branch",
	latest."pr_url",
	latest."failure_reason",
	latest."queued_at",
	latest."started_at",
	CASE WHEN latest."status" = 'done' THEN latest."finished_at" END,
	CASE WHEN latest."status" = 'done' THEN latest."finished_at" END,
	CASE WHEN latest."status" IN ('done', 'failed', 'cancelled') THEN latest."finished_at" END
FROM (
	SELECT DISTINCT ON (qi."plan_id")
		qi."id", qi."plan_id", qi."ordinal", qi."status", qi."branch", qi."pr_url", qi."failure_reason",
		qi."started_at", qi."finished_at", q."machine_id", q."created_at" AS "queued_at", p."repository_id"
	FROM "queue_items" AS qi
	JOIN "queues" AS q ON q."id" = qi."queue_id"
	JOIN "plans" AS p ON p."id" = qi."plan_id"
	WHERE p."repository_id" IS NOT NULL
	ORDER BY qi."plan_id", qi."started_at" DESC NULLS FIRST
) AS latest;
--> statement-breakpoint
UPDATE "slice_runs" AS sr
SET "build_id" = b."id"
FROM "builds" AS b
WHERE b."id" = 'bld_' || substr(sr."queue_item_id", 4);
--> statement-breakpoint
DELETE FROM "slice_runs" WHERE "build_id" IS NULL;
--> statement-breakpoint
UPDATE "slice_runs" AS sr
SET "phase" = 'drive'
FROM "slices" AS s
WHERE s."id" = sr."slice_id" AND s."kind" = 'verify';
--> statement-breakpoint
INSERT INTO "plan_dependencies" ("id", "plan_id", "provider_plan_id", "provider_slice_id", "source", "reason")
SELECT 'dep_' || substr(md5(pb."plan_id" || ':' || pb."blocked_by_plan_id"), 1, 12), pb."plan_id", pb."blocked_by_plan_id", NULL, 'planned', 'declared in planning'
FROM "plan_blockers" AS pb;
--> statement-breakpoint
INSERT INTO "repository_messages" ("id", "repository_id", "role", "content", "created_at")
SELECT 'rm_' || substr(qm."id", 4), m."repository_id", qm."role", qm."content", qm."created_at"
FROM "queue_messages" AS qm
JOIN "queues" AS q ON q."id" = qm."queue_id"
JOIN "machines" AS m ON m."id" = q."machine_id"
WHERE m."repository_id" IS NOT NULL;
