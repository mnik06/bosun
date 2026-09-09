import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { plans } from 'src/services/drizzle/schema';
import { PlanSchema, type Plan, type PlanStatus } from 'src/types/PlanSchema';

const columns = {
	id: plans.id,
	userId: plans.userId,
	number: plans.number,
	machineId: plans.machineId,
	title: plans.title,
	bodyMd: plans.bodyMd,
	status: plans.status,
	verifyInUi: plans.verifyInUi,
	auto: plans.auto,
	confirmedAt: plans.confirmedAt,
	failureReason: plans.failureReason,
	input: plans.input,
	createdAt: plans.createdAt
};

// Reads are owner-scoped or machine-scoped, never bare by id: a plan carries the
// pasted ticket and the whole transcript, so an unscoped getter is a leak
// waiting for the first careless caller.
export function getPlanRepo(db: DbOrTx) {
	return {
		// The number is taken in the insert rather than read first and written
		// second: two creates racing would otherwise both read the same max. The
		// unique index is what makes the loser fail, and the caller retries.
		async create(opts: {
			id: string;
			userId: string;
			machineId: string;
			input: string;
			verifyInUi: boolean;
			auto: boolean;
		}): Promise<Plan> {
			const [row] = await db
				.insert(plans)
				.values({
					...opts,
					number: sql`(select coalesce(max(${plans.number}), 0) + 1 from ${plans} where ${plans.userId} = ${opts.userId})`
				})
				.returning(columns);

			return PlanSchema.parse(row);
		},

		// Everything a session may reason about when it asks what else exists for
		// this machine. Owner-scoped as well as machine-scoped: the agent asks with
		// a machine key, and a machine belongs to exactly one person.
		async listForMachineContext(machineId: string): Promise<Plan[]> {
			const rows = await db
				.select(columns)
				.from(plans)
				.where(eq(plans.machineId, machineId))
				.orderBy(asc(plans.number));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async getByNumbers(opts: { userId: string; numbers: number[] }): Promise<Plan[]> {
			if (opts.numbers.length === 0) {
				return [];
			}

			const rows = await db
				.select(columns)
				.from(plans)
				.where(and(eq(plans.userId, opts.userId), inArray(plans.number, opts.numbers)));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async listOwned(userId: string): Promise<Plan[]> {
			const rows = await db
				.select(columns)
				.from(plans)
				.where(eq(plans.userId, userId))
				.orderBy(desc(plans.createdAt));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; userId: string }): Promise<Plan | null> {
			const [row] = await db
				.select(columns)
				.from(plans)
				.where(and(eq(plans.id, opts.id), eq(plans.userId, opts.userId)));

			return row ? PlanSchema.parse(row) : null;
		},

		async getByIdForMachine(opts: { id: string; machineId: string }): Promise<Plan | null> {
			const [row] = await db
				.select(columns)
				.from(plans)
				.where(and(eq(plans.id, opts.id), eq(plans.machineId, opts.machineId)));

			return row ? PlanSchema.parse(row) : null;
		},

		async update(opts: {
			id: string;
			title?: string | null;
			bodyMd?: string | null;
			status?: PlanStatus;
			confirmedAt?: Date | null;
			failureReason?: string | null;
		}): Promise<Plan | null> {
			const { id, ...values } = opts;
			const [row] = await db
				.update(plans)
				.set(values)
				.where(eq(plans.id, id))
				.returning(columns);

			return row ? PlanSchema.parse(row) : null;
		},

		async listPlanningOnMachine(machineId: string): Promise<Plan[]> {
			const rows = await db
				.select(columns)
				.from(plans)
				.where(and(eq(plans.machineId, machineId), eq(plans.status, 'planning')));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async failMany(opts: { ids: string[]; reason: string }): Promise<Plan[]> {
			const rows = await db
				.update(plans)
				.set({ status: 'failed', failureReason: opts.reason })
				.where(inArray(plans.id, opts.ids))
				.returning(columns);

			return rows.map((row) => PlanSchema.parse(row));
		},

		async deleteOwned(opts: { id: string; userId: string }): Promise<boolean> {
			const rows = await db
				.delete(plans)
				.where(and(eq(plans.id, opts.id), eq(plans.userId, opts.userId)))
				.returning({ id: plans.id });

			return rows.length > 0;
		}
	};
}

export type PlanRepo = ReturnType<typeof getPlanRepo>;
