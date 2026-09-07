import { and, asc, eq } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { slices } from 'src/services/drizzle/schema';
import { SliceSchema, type Slice, type SliceKind } from 'src/types/PlanSchema';

const columns = {
	id: slices.id,
	planId: slices.planId,
	ordinal: slices.ordinal,
	kind: slices.kind,
	title: slices.title,
	bodyMd: slices.bodyMd
};

export function getSliceRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			planId: string;
			ordinal: number;
			kind: SliceKind;
			title: string;
			bodyMd?: string | null;
		}): Promise<Slice> {
			const [row] = await db.insert(slices).values(opts).returning(columns);

			return SliceSchema.parse(row);
		},

		async listByPlan(planId: string): Promise<Slice[]> {
			const rows = await db
				.select(columns)
				.from(slices)
				.where(eq(slices.planId, planId))
				.orderBy(asc(slices.ordinal));

			return rows.map((row) => SliceSchema.parse(row));
		},

		async updateInPlan(opts: {
			id: string;
			planId: string;
			title?: string;
			bodyMd?: string | null;
			ordinal?: number;
		}): Promise<Slice | null> {
			const { id, planId, ...values } = opts;
			const [row] = await db
				.update(slices)
				.set(values)
				.where(and(eq(slices.id, id), eq(slices.planId, planId)))
				.returning(columns);

			return row ? SliceSchema.parse(row) : null;
		},

		async deleteInPlan(opts: { id: string; planId: string }): Promise<boolean> {
			const rows = await db
				.delete(slices)
				.where(and(eq(slices.id, opts.id), eq(slices.planId, opts.planId)))
				.returning({ id: slices.id });

			return rows.length > 0;
		}
	};
}

export type SliceRepo = ReturnType<typeof getSliceRepo>;
