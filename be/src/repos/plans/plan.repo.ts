import { and, asc, desc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { machines, plans } from 'src/services/drizzle/schema';
import { PlanSchema, type Plan, type PlanStatus } from 'src/types/PlanSchema';
import { type PlanSummary } from 'src/types/PlanSummarySchema';

export const planColumns = {
	id: plans.id,
	projectId: plans.projectId,
	createdByUserId: plans.createdByUserId,
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
	summary: plans.summary,
	summarisedAt: plans.summarisedAt,
	preparesPlanIds: plans.preparesPlanIds,
	createdAt: plans.createdAt
};

// Reads are project-scoped or machine-scoped, never bare by id: a plan carries
// the pasted ticket and the whole transcript, so an unscoped getter is a leak
// waiting for the first careless caller.
export function getPlanRepo(db: DbOrTx) {
	return {
		// The number is taken in the insert rather than read first and written
		// second: two creates racing would otherwise both read the same max. The
		// unique index is what makes the loser fail, and the caller retries.
		async create(opts: {
			id: string;
			projectId: string;
			createdByUserId: string;
			machineId: string;
			input: string;
			verifyInUi: boolean;
			auto: boolean;
			preparesPlanIds?: string[];
		}): Promise<Plan> {
			const [row] = await db
				.insert(plans)
				.values({
					...opts,
					number: sql`(select coalesce(max(${plans.number}), 0) + 1 from ${plans} where ${plans.projectId} = ${opts.projectId})`
				})
				.returning(planColumns);

			return PlanSchema.parse(row);
		},

		// Everything a session may reason about when it asks what else exists for
		// this machine. Machine-scoped is enough: the agent asks with a machine key,
		// and a machine belongs to exactly one project.
		async listForMachineContext(machineId: string): Promise<Plan[]> {
			const rows = await db
				.select(planColumns)
				.from(plans)
				.where(eq(plans.machineId, machineId))
				.orderBy(asc(plans.number));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async getByNumbers(opts: { projectId: string; numbers: number[] }): Promise<Plan[]> {
			if (opts.numbers.length === 0) {
				return [];
			}

			const rows = await db
				.select(planColumns)
				.from(plans)
				.where(
					and(eq(plans.projectId, opts.projectId), inArray(plans.number, opts.numbers))
				);

			return rows.map((row) => PlanSchema.parse(row));
		},

		async listOwned(projectId: string): Promise<Plan[]> {
			const rows = await db
				.select(planColumns)
				.from(plans)
				.where(eq(plans.projectId, projectId))
				.orderBy(desc(plans.createdAt));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async getOwnedById(opts: { id: string; projectId: string }): Promise<Plan | null> {
			const [row] = await db
				.select(planColumns)
				.from(plans)
				.where(and(eq(plans.id, opts.id), eq(plans.projectId, opts.projectId)));

			return row ? PlanSchema.parse(row) : null;
		},

		async listOwnedByIds(opts: { projectId: string; ids: string[] }): Promise<Plan[]> {
			if (opts.ids.length === 0) {
				return [];
			}

			const rows = await db
				.select(planColumns)
				.from(plans)
				.where(and(eq(plans.projectId, opts.projectId), inArray(plans.id, opts.ids)))
				.orderBy(asc(plans.number));

			return rows.map((row) => PlanSchema.parse(row));
		},

		async getByIdForMachine(opts: { id: string; machineId: string }): Promise<Plan | null> {
			const [row] = await db
				.select(planColumns)
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
				.returning(planColumns);

			return row ? PlanSchema.parse(row) : null;
		},

		async listPlanningOnMachine(machineId: string): Promise<Plan[]> {
			const rows = await db
				.select(planColumns)
				.from(plans)
				.where(and(eq(plans.machineId, machineId), eq(plans.status, 'planning')));

			return rows.map((row) => PlanSchema.parse(row));
		},

		// A grill whose machine has not been heard from since `unseenSince`. The
		// agent ends its own sessions at that age, so one still `planning` past it on
		// a machine that is not connected has no session left behind it — and nothing
		// else will ever settle it, because settling happens on the agent's `hello`.
		async listStalePlanning(opts: { unseenSince: Date }): Promise<Plan[]> {
			const rows = await db
				.select(planColumns)
				.from(plans)
				.innerJoin(machines, eq(machines.id, plans.machineId))
				.where(
					and(
						eq(plans.status, 'planning'),
						lt(plans.createdAt, opts.unseenSince),
						ne(machines.status, 'online'),
						or(lt(machines.lastSeenAt, opts.unseenSince), sql`${machines.lastSeenAt} is null`)
					)
				);

			return rows.map((row) => PlanSchema.parse(row));
		},

		async failMany(opts: { ids: string[]; reason: string }): Promise<Plan[]> {
			const rows = await db
				.update(plans)
				.set({ status: 'failed', failureReason: opts.reason })
				.where(inArray(plans.id, opts.ids))
				.returning(planColumns);

			return rows.map((row) => PlanSchema.parse(row));
		},

		// Not part of `update`: it is written by a different session at a different
		// time from everything else on the row, and folding it in would let a plan
		// edit silently blank a summary by omitting the field.
		async saveSummary(opts: {
			id: string;
			summary: PlanSummary;
			now: Date;
		}): Promise<Plan | null> {
			const [row] = await db
				.update(plans)
				.set({ summary: opts.summary, summarisedAt: opts.now })
				.where(eq(plans.id, opts.id))
				.returning(planColumns);

			return row ? PlanSchema.parse(row) : null;
		},

		async deleteOwned(opts: { id: string; projectId: string }): Promise<boolean> {
			const rows = await db
				.delete(plans)
				.where(and(eq(plans.id, opts.id), eq(plans.projectId, opts.projectId)))
				.returning({ id: plans.id });

			return rows.length > 0;
		}
	};
}

export type PlanRepo = ReturnType<typeof getPlanRepo>;
