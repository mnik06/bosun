import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';
import {
	type PlanMessageContent,
	type PlanMessageRole,
	type PlanStatus,
	type SliceKind
} from 'src/types/PlanSchema';
import {
	type QueueItemStatus,
	type QueueStatus,
	type SliceRunStatus
} from 'src/types/QueueSchema';

export const users = pgTable('users', {
	id: text().primaryKey(),
	subId: uuid().notNull().unique(),
	email: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

export const machines = pgTable(
	'machines',
	{
		id: text().primaryKey(),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		enrollmentToken: text().unique(),
		tokenExpiresAt: timestamp({ withTimezone: true }),
		tokenUsedAt: timestamp({ withTimezone: true }),
		machineKeyHash: text(),
		status: text().$type<MachineStatus>().notNull().default('pending'),
		lastSeenAt: timestamp({ withTimezone: true }),
		repoPath: text(),
		agentVersion: text(),
		capabilities: jsonb().$type<PreflightCheck[]>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('machines_user_id_idx').on(table.userId)]
);

export const plans = pgTable(
	'plans',
	{
		id: text().primaryKey(),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		// A number a person can say out loud. Plans are referred to across machines,
		// in prompts and in blocker lists, and a nanoid is not something anyone can
		// hold in their head or read back to you.
		number: integer().notNull(),
		title: text(),
		bodyMd: text(),
		status: text().$type<PlanStatus>().notNull().default('planning'),
		failureReason: text(),
		input: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('plans_user_id_idx').on(table.userId),
		index('plans_machine_id_idx').on(table.machineId),
		// Unique so two concurrent creates cannot both take max+1 — one loses and
		// retries rather than two plans quietly sharing a number.
		unique('plans_user_number_key').on(table.userId, table.number)
	]
);

export const planMessages = pgTable(
	'plan_messages',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		seq: integer().notNull(),
		role: text().$type<PlanMessageRole>().notNull(),
		content: jsonb().$type<PlanMessageContent>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	// The transcript is replayed in `seq` order and appended to concurrently by
	// the stream and by answers, so a duplicate sequence number is a reordered
	// transcript rather than a harmless collision.
	(table) => [unique('plan_messages_plan_seq_key').on(table.planId, table.seq)]
);

export const slices = pgTable(
	'slices',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		ordinal: integer().notNull(),
		kind: text().$type<SliceKind>().notNull().default('build'),
		title: text().notNull(),
		bodyMd: text()
	},
	(table) => [index('slices_plan_id_idx').on(table.planId)]
);

export const acs = pgTable(
	'acs',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		code: text().notNull(),
		text: text().notNull(),
		// Nulled rather than cascaded when a slice goes, because deleting a slice
		// that still owns an AC is refused: an AC must never be silently dropped
		// along with the bullet that claimed it.
		sliceId: text().references(() => slices.id, { onDelete: 'set null' }),
		ordinal: integer().notNull()
	},
	(table) => [
		index('acs_plan_id_idx').on(table.planId),
		unique('acs_plan_code_key').on(table.planId, table.code)
	]
);

// A queue is a git worktree on one machine. Two queues on the same machine run
// side by side without sharing a working tree, which is the whole reason the
// worktree rather than the repository is the unit.
export const queues = pgTable(
	'queues',
	{
		id: text().primaryKey(),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		slug: text().notNull(),
		worktreePath: text(),
		baseRef: text(),
		afk: boolean().notNull().default(false),
		status: text().$type<QueueStatus>().notNull().default('provisioning'),
		failureReason: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	// The slug names a directory and a branch on the machine, so two queues on one
	// machine cannot share it without one of them writing over the other's tree.
	(table) => [
		index('queues_user_id_idx').on(table.userId),
		unique('queues_machine_slug_key').on(table.machineId, table.slug)
	]
);

export const queueItems = pgTable(
	'queue_items',
	{
		id: text().primaryKey(),
		queueId: text()
			.notNull()
			.references(() => queues.id, { onDelete: 'cascade' }),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		ordinal: integer().notNull(),
		// Cut fresh from baseRef per plan: a plan that fails leaves its partial work
		// on its own branch instead of underneath the next plan's pull request.
		branch: text(),
		status: text().$type<QueueItemStatus>().notNull().default('queued'),
		prUrl: text(),
		failureReason: text(),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [
		index('queue_items_queue_id_idx').on(table.queueId),
		unique('queue_items_queue_plan_key').on(table.queueId, table.planId)
	]
);

export const sliceRuns = pgTable(
	'slice_runs',
	{
		id: text().primaryKey(),
		queueItemId: text()
			.notNull()
			.references(() => queueItems.id, { onDelete: 'cascade' }),
		sliceId: text()
			.notNull()
			.references(() => slices.id, { onDelete: 'cascade' }),
		ordinal: integer().notNull(),
		status: text().$type<SliceRunStatus>().notNull().default('pending'),
		commitSha: text(),
		failureReason: text(),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true })
	},
	(table) => [index('slice_runs_queue_item_id_idx').on(table.queueItemId)]
);

// A plan that cannot start until another one has landed. An edge rather than a
// column because a plan is routinely waiting on more than one, and because the
// pair is the fact — neither side owns it.
export const planBlockers = pgTable(
	'plan_blockers',
	{
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		blockedByPlanId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.planId, table.blockedByPlanId] }),
		index('plan_blockers_blocked_by_idx').on(table.blockedByPlanId)
	]
);
