import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { acs } from 'src/services/drizzle/schema';
import { AcSchema, type Ac } from 'src/types/PlanSchema';

const columns = {
	id: acs.id,
	planId: acs.planId,
	code: acs.code,
	text: acs.text,
	sliceId: acs.sliceId,
	ordinal: acs.ordinal
};

export function getAcRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			planId: string;
			code: string;
			text: string;
			ordinal: number;
		}): Promise<Ac> {
			const [row] = await db.insert(acs).values(opts).returning(columns);

			return AcSchema.parse(row);
		},

		async listByPlan(planId: string): Promise<Ac[]> {
			const rows = await db
				.select(columns)
				.from(acs)
				.where(eq(acs.planId, planId))
				.orderBy(asc(acs.ordinal));

			return rows.map((row) => AcSchema.parse(row));
		},

		async listByCodes(opts: { planId: string; codes: string[] }): Promise<Ac[]> {
			const rows = await db
				.select(columns)
				.from(acs)
				.where(and(eq(acs.planId, opts.planId), inArray(acs.code, opts.codes)));

			return rows.map((row) => AcSchema.parse(row));
		},

		async listUnassigned(planId: string): Promise<Ac[]> {
			const rows = await db
				.select(columns)
				.from(acs)
				.where(and(eq(acs.planId, planId), isNull(acs.sliceId)))
				.orderBy(asc(acs.ordinal));

			return rows.map((row) => AcSchema.parse(row));
		},

		async listBySlice(sliceId: string): Promise<Ac[]> {
			const rows = await db.select(columns).from(acs).where(eq(acs.sliceId, sliceId));

			return rows.map((row) => AcSchema.parse(row));
		},

		async assignToSlice(opts: {
			planId: string;
			codes: string[];
			sliceId: string;
		}): Promise<Ac[]> {
			const rows = await db
				.update(acs)
				.set({ sliceId: opts.sliceId })
				.where(and(eq(acs.planId, opts.planId), inArray(acs.code, opts.codes)))
				.returning(columns);

			return rows.map((row) => AcSchema.parse(row));
		},

		async updateInPlan(opts: {
			id: string;
			planId: string;
			text?: string;
			sliceId?: string | null;
		}): Promise<Ac | null> {
			const { id, planId, ...values } = opts;
			const [row] = await db
				.update(acs)
				.set(values)
				.where(and(eq(acs.id, id), eq(acs.planId, planId)))
				.returning(columns);

			return row ? AcSchema.parse(row) : null;
		},

		async deleteInPlan(opts: { id: string; planId: string }): Promise<boolean> {
			const rows = await db
				.delete(acs)
				.where(and(eq(acs.id, opts.id), eq(acs.planId, opts.planId)))
				.returning({ id: acs.id });

			return rows.length > 0;
		}
	};
}

export type AcRepo = ReturnType<typeof getAcRepo>;
