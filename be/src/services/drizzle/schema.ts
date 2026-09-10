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
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';
import { type ProjectRole } from 'src/types/ProjectSchema';
import { type PlanSummary } from 'src/types/PlanSummarySchema';
import {
	type PlanMessageContent,
	type PlanMessageRole,
	type PlanQuestion,
	type PlanStatus,
	type SliceKind
} from 'src/types/PlanSchema';
import {
	type QueueItemStatus,
	type QueueMessageRole,
	type QueueStatus,
	type SliceRunStatus
} from 'src/types/QueueSchema';

export const users = pgTable('users', {
	id: text().primaryKey(),
	subId: uuid().notNull().unique(),
	email: text().notNull(),
	// Not a role in `project_members`: it is not scoped to a project, and putting
	// it there would mean writing a row for every project that will ever exist.
	isAppOwner: boolean().notNull().default(false),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

// The unit of ownership. A boundary rather than a workspace: machines, plans and
// queues belong to one, and membership in it is the only thing that grants sight
// of them.
export const projects = pgTable('projects', {
	id: text().primaryKey(),
	name: text().notNull(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
});

// A row rather than a column on either side, because the pair is the fact and
// neither the project nor the person owns it.
export const projectMembers = pgTable(
	'project_members',
	{
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text()
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text().$type<ProjectRole>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.projectId, table.userId] }),
		index('project_members_user_id_idx').on(table.userId)
	]
);

export const machines = pgTable(
	'machines',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
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
		projectProfile: jsonb().$type<ProjectProfile>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('machines_project_id_idx').on(table.projectId)]
);

export const plans = pgTable(
	'plans',
	{
		id: text().primaryKey(),
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		// Who started it, for display only. Nulled rather than cascaded when the
		// person leaves: the plan belongs to the project and outlives them.
		createdByUserId: text().references(() => users.id, { onDelete: 'set null' }),
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
		// Settled when the ticket is pasted, not by the session: whether this plan
		// ends in a verify bullet that drives the feature through its interface.
		verifyInUi: boolean().notNull().default(true),
		// Also settled when the ticket is pasted: the grill runs unchanged, but the
		// session answers its own questions with the option it recommended instead
		// of stopping for a person who is not there.
		auto: boolean().notNull().default(false),
		// The person's own sign-off. A session can publish a plan it is pleased
		// with; only this says somebody read it and is willing to have it built.
		// Cleared by a republish, because what was signed off no longer exists.
		confirmedAt: timestamp({ withTimezone: true }),
		failureReason: text(),
		input: text().notNull(),
		// Written after the branch lands, by a session that read the diff rather
		// than by the ones that wrote it. Survives a republish: it describes code
		// that exists, not the plan that asked for it.
		summary: jsonb().$type<PlanSummary>(),
		summarisedAt: timestamp({ withTimezone: true }),
		// Set only on a preparation plan, and only by the endpoint that creates one:
		// the plans its session was asked to rewrite. It is the authorization scope
		// for republishing somebody else's plan, so it is never written from a
		// session — a session that could name its own scope has no scope at all.
		preparesPlanIds: jsonb().$type<string[]>(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('plans_project_id_idx').on(table.projectId),
		index('plans_machine_id_idx').on(table.machineId),
		// Unique so two concurrent creates cannot both take max+1 — one loses and
		// retries rather than two plans quietly sharing a number.
		unique('plans_project_number_key').on(table.projectId, table.number)
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
		ordinal: integer().notNull(),
		// Ticked by the sessions, never by the browser. A build bullet may not
		// finish while one of its criteria is unimplemented — this column is what
		// that refusal is decided from.
		implemented: boolean().notNull().default(false),
		verified: boolean().notNull().default(false),
		// Why this criterion could not be driven. A verify bullet must account for
		// every criterion, but accounting for one is not the same as passing it: an
		// app that will not start is a fact for the reviewer, not a reason to hold
		// the whole branch back. Set means "explained"; null with `verified` false
		// means "silently skipped", which is what the gate still refuses.
		blockedReason: text()
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
		projectId: text()
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		machineId: text()
			.notNull()
			.references(() => machines.id, { onDelete: 'cascade' }),
		name: text().notNull(),
		slug: text().notNull(),
		worktreePath: text(),
		baseRef: text(),
		afk: boolean().notNull().default(false),
		// Every running queue on a machine may start a dev stack of its own, so each
		// gets a range nobody else is listening on. Without it the second queue's
		// server dies on a port the first one holds.
		portBase: integer().notNull(),
		status: text().$type<QueueStatus>().notNull().default('provisioning'),
		failureReason: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	// The slug names a directory and a branch on the machine, so two queues on one
	// machine cannot share it without one of them writing over the other's tree.
	(table) => [
		index('queues_project_id_idx').on(table.projectId),
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
		// The question this run is blocked on, if any. Persisted rather than left in
		// the browser's socket state: a reload used to lose the only control that
		// could answer it, leaving a queue blocked on a session nobody could reach.
		questionId: text(),
		question: jsonb().$type<PlanQuestion[]>(),
		commitSha: text(),
		// What the session said when it finished. The verify bullet is ordered to
		// report a verdict per criterion and it is the only account of what was
		// driven, so it is kept rather than dropped on arrival — the pull request
		// quotes it and a failed gate is unreadable without it.
		report: text(),
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

// The forks a plan could not settle, resolved while executing it. Kept as rows
// rather than prose in the plan body: the pull request quotes them, the browser
// shows them as they land, and a session that made one cannot quietly revise it
// later.
export const planDecisions = pgTable(
	'plan_decisions',
	{
		id: text().primaryKey(),
		planId: text()
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		sliceId: text().references(() => slices.id, { onDelete: 'set null' }),
		fork: text().notNull(),
		options: text(),
		chose: text().notNull(),
		blastRadius: text(),
		reversing: text(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('plan_decisions_plan_id_idx').on(table.planId)]
);

// A conversation about a queue, not a session's transcript. Kept so the answer
// to "what happened overnight" survives the process that answered it, and so a
// follow-up question knows what was already asked.
export const queueMessages = pgTable(
	'queue_messages',
	{
		id: text().primaryKey(),
		queueId: text()
			.notNull()
			.references(() => queues.id, { onDelete: 'cascade' }),
		role: text().$type<QueueMessageRole>().notNull(),
		content: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('queue_messages_queue_id_idx').on(table.queueId)]
);
