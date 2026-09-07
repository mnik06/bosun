import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';
import {
	type PlanMessageContent,
	type PlanMessageRole,
	type PlanStatus,
	type SliceKind
} from 'src/types/PlanSchema';

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
		title: text(),
		bodyMd: text(),
		status: text().$type<PlanStatus>().notNull().default('planning'),
		failureReason: text(),
		input: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('plans_user_id_idx').on(table.userId), index('plans_machine_id_idx').on(table.machineId)]
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
