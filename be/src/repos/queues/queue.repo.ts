import { and, count, desc, eq, ne, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { queues } from 'src/services/drizzle/schema';
import { QueueSchema, type Queue, type QueueStatus } from 'src/types/QueueSchema';

// Ten ports each: a dev stack is rarely one listener, and leaving room means a
// project that adds a second server does not need every queue renumbered.
const PORT_BASE_START = 4100;
const PORT_BASE_STRIDE = 10;

const columns = {
	id: queues.id,
	userId: queues.userId,
	machineId: queues.machineId,
	name: queues.name,
	slug: queues.slug,
	worktreePath: queues.worktreePath,
	baseRef: queues.baseRef,
	afk: queues.afk,
	portBase: queues.portBase,
	status: queues.status,
	failureReason: queues.failureReason,
	createdAt: queues.createdAt
};

// Owner-scoped or machine-scoped like every other read here. A queue names a
// path on somebody's box, which is not something an unscoped getter should be
// able to hand out.
export function getQueueRepo(db: DbOrTx) {
	return {
		// The port range is taken in the insert for the same reason the plan number
		// is: two creates racing would otherwise both read the same maximum and hand
		// two queues the same listener.
		async create(opts: {
			id: string;
			userId: string;
			machineId: string;
			name: string;
			slug: string;
			afk: boolean;
		}): Promise<Queue> {
			const [row] = await db
				.insert(queues)
				.values({
					...opts,
					portBase: sql`(select coalesce(max(${queues.portBase}), ${PORT_BASE_START} - ${PORT_BASE_STRIDE}) + ${PORT_BASE_STRIDE} from ${queues} where ${queues.machineId} = ${opts.machineId})`
				})
				.returning(columns);

			return QueueSchema.parse(row);
		},

		async listOwned(userId: string): Promise<Queue[]> {
			const rows = await db
				.select(columns)
				.from(queues)
				.where(eq(queues.userId, userId))
				.orderBy(desc(queues.createdAt));

			return rows.map((row) => QueueSchema.parse(row));
		},

		async listForMachine(opts: { machineId: string; userId: string }): Promise<Queue[]> {
			const rows = await db
				.select(columns)
				.from(queues)
				.where(and(eq(queues.machineId, opts.machineId), eq(queues.userId, opts.userId)))
				.orderBy(desc(queues.createdAt));

			return rows.map((row) => QueueSchema.parse(row));
		},

		// Scheduler-only, and the one getter here that is neither owner- nor
		// machine-scoped: advancing a queue is reached from an agent frame that has
		// already been authenticated against the run it settles.
		async getById(id: string): Promise<Queue | null> {
			const [row] = await db.select(columns).from(queues).where(eq(queues.id, id));

			return row ? QueueSchema.parse(row) : null;
		},

		// Every running queue holds a `claude` process in a worktree of its own.
		// Counting them is what keeps five queues from taking a 2 GB box down.
		async countRunningForMachine(machineId: string): Promise<number> {
			const [row] = await db
				.select({ running: count() })
				.from(queues)
				.where(and(eq(queues.machineId, machineId), eq(queues.status, 'running')));

			return Number(row?.running ?? 0);
		},

		async listRunnableForMachine(machineId: string): Promise<Queue[]> {
			const rows = await db
				.select(columns)
				.from(queues)
				.where(
					and(
						eq(queues.machineId, machineId),
						ne(queues.status, 'paused'),
						ne(queues.status, 'blocked'),
						ne(queues.status, 'stopped'),
						ne(queues.status, 'failed'),
						ne(queues.status, 'provisioning')
					)
				);

			return rows.map((row) => QueueSchema.parse(row));
		},

		async listProvisioningForMachine(machineId: string): Promise<Queue[]> {
			const rows = await db
				.select(columns)
				.from(queues)
				.where(and(eq(queues.machineId, machineId), eq(queues.status, 'provisioning')));

			return rows.map((row) => QueueSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; userId: string }): Promise<Queue | null> {
			const [row] = await db
				.select(columns)
				.from(queues)
				.where(and(eq(queues.id, opts.id), eq(queues.userId, opts.userId)));

			return row ? QueueSchema.parse(row) : null;
		},

		// Reached from an agent frame, which carries a machine rather than a user.
		async getByIdForMachine(opts: { id: string; machineId: string }): Promise<Queue | null> {
			const [row] = await db
				.select(columns)
				.from(queues)
				.where(and(eq(queues.id, opts.id), eq(queues.machineId, opts.machineId)));

			return row ? QueueSchema.parse(row) : null;
		},

		async update(opts: {
			id: string;
			status?: QueueStatus;
			worktreePath?: string | null;
			baseRef?: string | null;
			afk?: boolean;
			failureReason?: string | null;
		}): Promise<Queue | null> {
			const { id, ...changes } = opts;
			const [row] = await db
				.update(queues)
				.set(changes)
				.where(eq(queues.id, id))
				.returning(columns);

			return row ? QueueSchema.parse(row) : null;
		},

		async remove(id: string): Promise<void> {
			await db.delete(queues).where(eq(queues.id, id));
		}
	};
}

export type QueueRepo = ReturnType<typeof getQueueRepo>;
