import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { type getDb } from 'src/services/drizzle/drizzle.service';
import { machines } from 'src/services/drizzle/schema';
import {
	EnrollmentSchema,
	MachineSchema,
	type Enrollment,
	type Machine,
	type PreflightCheck
} from 'src/types/MachineSchema';

type Db = ReturnType<typeof getDb>;

const publicColumns = {
	id: machines.id,
	name: machines.name,
	status: machines.status,
	lastSeenAt: machines.lastSeenAt,
	repoPath: machines.repoPath,
	agentVersion: machines.agentVersion,
	capabilities: machines.capabilities,
	createdAt: machines.createdAt
};

export function getMachineRepo(db: Db) {
	return {
		async create(opts: {
			id: string;
			name: string;
			enrollmentToken: string;
			tokenExpiresAt: Date;
		}): Promise<Machine> {
			const [row] = await db.insert(machines).values(opts).returning(publicColumns);

			return MachineSchema.parse(row);
		},

		async listAll(): Promise<Machine[]> {
			const rows = await db
				.select(publicColumns)
				.from(machines)
				.orderBy(desc(machines.createdAt));

			return rows.map((row) => MachineSchema.parse(row));
		},

		async getById(id: string): Promise<Machine | null> {
			const [row] = await db.select(publicColumns).from(machines).where(eq(machines.id, id));

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
		): Promise<{ id: string; machineKeyHash: string } | null> {
			const [row] = await db
				.select({ id: machines.id, machineKeyHash: machines.machineKeyHash })
				.from(machines)
				.where(eq(machines.machineKeyHash, machineKeyHash));

			return row?.machineKeyHash ? { id: row.id, machineKeyHash: row.machineKeyHash } : null;
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
					status: 'online',
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
				.set({ status: 'offline', lastSeenAt: opts.now })
				.where(eq(machines.id, opts.id))
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
				.set({ capabilities: opts.checks, lastSeenAt: opts.now })
				.where(eq(machines.id, opts.id))
				.returning(publicColumns);

			return row ? MachineSchema.parse(row) : null;
		}
	};
}

export type MachineRepo = ReturnType<typeof getMachineRepo>;
