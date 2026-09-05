import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { type MachineStatus, type PreflightCheck } from 'src/types/MachineSchema';

export const machines = pgTable('machines', {
	id: text().primaryKey(),
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
});
