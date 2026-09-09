import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { type getDb } from 'src/services/drizzle/drizzle.service';
import { machines } from 'src/services/drizzle/schema';
import {
	EnrollmentSchema,
	MachineSchema,
	type Enrollment,
	type Machine,
	type MachineStatus,
	type PreflightCheck
} from 'src/types/MachineSchema';
import { type ProjectProfile } from 'src/types/ProjectProfileSchema';

type Db = ReturnType<typeof getDb>;

const publicColumns = {
	id: machines.id,
	projectId: machines.projectId,
	name: machines.name,
	status: machines.status,
	lastSeenAt: machines.lastSeenAt,
	repoPath: machines.repoPath,
	agentVersion: machines.agentVersion,
	capabilities: machines.capabilities,
	projectProfile: machines.projectProfile,
	createdAt: machines.createdAt
};

// `paused` is a property of the machine, not of its socket. Connecting or
// dropping must not silently un-pause it, so every status write that reflects
// reachability leaves a paused row alone.
function reachabilityStatus(next: Extract<MachineStatus, 'online' | 'offline'>) {
	return sql`case when ${machines.status} = 'paused' then 'paused' else ${next} end`;
}

// There is deliberately no unscoped read by id. A method that can be called
// without a project is a leak waiting for its first careless caller, so the
// project is part of the query rather than a check the controller might forget.
export function getMachineRepo(db: Db) {
	return {
		async create(opts: {
			id: string;
			projectId: string;
			name: string;
			enrollmentToken: string;
			tokenExpiresAt: Date;
		}): Promise<Machine> {
			const [row] = await db.insert(machines).values(opts).returning(publicColumns);

			return MachineSchema.parse(row);
		},

		async listOwned(projectId: string): Promise<Machine[]> {
			const rows = await db
				.select(publicColumns)
				.from(machines)
				.where(eq(machines.projectId, projectId))
				.orderBy(desc(machines.createdAt));

			return rows.map((row) => MachineSchema.parse(row));
		},

		// Scheduler-only, unscoped: dispatching a bullet is reached from a queue row
		// whose ownership has already been established.
		async getById(id: string): Promise<Machine | null> {
			const [row] = await db.select(publicColumns).from(machines).where(eq(machines.id, id));

			return row ? MachineSchema.parse(row) : null;
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<Machine | null> {
			const [row] = await db
				.select(publicColumns)
				.from(machines)
				.where(and(eq(machines.id, opts.id), eq(machines.projectId, opts.projectId)));

			return row ? MachineSchema.parse(row) : null;
		},

		async findEnrollmentByToken(token: string): Promise<Enrollment | null> {
			const [row] = await db
				.select({
					id: machines.id,
					tokenExpiresAt: machines.tokenExpiresAt,
					tokenUsedAt: machines.tokenUsedAt
				})
				.from(machines)
				.where(eq(machines.enrollmentToken, token));

			return row ? EnrollmentSchema.parse(row) : null;
		},

		async consumeEnrollmentToken(opts: {
			token: string;
			machineKeyHash: string;
			repoPath: string;
			now: Date;
		}): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({
					machineKeyHash: opts.machineKeyHash,
					repoPath: opts.repoPath,
					tokenUsedAt: opts.now,
					status: 'offline'
				})
				.where(
					and(
						eq(machines.enrollmentToken, opts.token),
						isNull(machines.tokenUsedAt),
						gt(machines.tokenExpiresAt, opts.now)
					)
				)
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		},

		async findAuthByKeyHash(
			machineKeyHash: string
		): Promise<{ id: string; projectId: string; machineKeyHash: string } | null> {
			const [row] = await db
				.select({
					id: machines.id,
					projectId: machines.projectId,
					machineKeyHash: machines.machineKeyHash
				})
				.from(machines)
				.where(eq(machines.machineKeyHash, machineKeyHash));

			return row?.machineKeyHash
				? { id: row.id, projectId: row.projectId, machineKeyHash: row.machineKeyHash }
				: null;
		},

		async markOnline(opts: {
			id: string;
			agentVersion: string;
			repoPath: string;
			now: Date;
		}): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({
					status: reachabilityStatus('online'),
					agentVersion: opts.agentVersion,
					repoPath: opts.repoPath,
					lastSeenAt: opts.now
				})
				.where(eq(machines.id, opts.id))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		},

		async markOffline(opts: { id: string; now: Date }): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({ status: reachabilityStatus('offline'), lastSeenAt: opts.now })
				.where(eq(machines.id, opts.id))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		},

		// The timestamp and nothing else. A pong says the socket is still there, not
		// that anything about the machine changed, and writing a status here would
		// fight the pause and enrollment paths over a row they own. Nothing is
		// returned because no screen changes: `lastSeenAt` moving is the absence of
		// news, and announcing it would repaint every machine card every minute.
		async touch(opts: { id: string; now: Date }): Promise<void> {
			await db.update(machines).set({ lastSeenAt: opts.now }).where(eq(machines.id, opts.id));
		},

		async setOwnedStatus(opts: {
			id: string;
			projectId: string;
			status: MachineStatus;
		}): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({ status: opts.status })
				.where(and(eq(machines.id, opts.id), eq(machines.projectId, opts.projectId)))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		},

		async deleteOwned(opts: { id: string; projectId: string }): Promise<boolean> {
			const rows = await db
				.delete(machines)
				.where(and(eq(machines.id, opts.id), eq(machines.projectId, opts.projectId)))
				.returning({ id: machines.id });

			return rows.length > 0;
		},

		async saveProjectProfile(opts: {
			id: string;
			projectId: string;
			projectProfile: ProjectProfile;
		}): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({ projectProfile: opts.projectProfile })
				.where(and(eq(machines.id, opts.id), eq(machines.projectId, opts.projectId)))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		},

		async saveCapabilities(opts: {
			id: string;
			checks: PreflightCheck[];
			now: Date;
		}): Promise<Machine | null> {
			const [row] = await db
				.update(machines)
				.set({
					capabilities: opts.checks,
					lastSeenAt: opts.now
				})
				.where(eq(machines.id, opts.id))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		}
	};
}

export type MachineRepo = ReturnType<typeof getMachineRepo>;
