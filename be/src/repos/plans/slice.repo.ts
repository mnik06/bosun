import { and, asc, eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { slices } from 'src/services/drizzle/schema';
import { type Footprint } from 'src/types/FootprintSchema';
import { SliceSchema, type Slice, type SliceKind } from 'src/types/PlanSchema';

const columns = {
	id: slices.id,
	planId: slices.planId,
	ordinal: slices.ordinal,
	kind: slices.kind,
	title: slices.title,
	bodyMd: slices.bodyMd,
	foundation: slices.foundation,
	footprint: slices.footprint,
	changedFiles: slices.changedFiles
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
			foundation: boolean;
			footprint: Footprint;
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

		async listByPlans(planIds: string[]): Promise<Slice[]> {
			if (planIds.length === 0) {
				return [];
			}

			const rows = await db
				.select(columns)
				.from(slices)
				.where(inArray(slices.planId, planIds))
				.orderBy(asc(slices.ordinal));

			return rows.map((row) => SliceSchema.parse(row));
		},

		async getById(id: string): Promise<Slice | null> {
			const [row] = await db.select(columns).from(slices).where(eq(slices.id, id));

			return row ? SliceSchema.parse(row) : null;
		},

		async updateInPlan(opts: {
			id: string;
			planId: string;
			kind?: SliceKind;
			title?: string;
			bodyMd?: string | null;
			ordinal?: number;
			foundation?: boolean;
			footprint?: Footprint;
		}): Promise<Slice | null> {
			const { id, planId, ...values } = opts;
			const [row] = await db
				.update(slices)
				.set(values)
				.where(and(eq(slices.id, id), eq(slices.planId, planId)))
				.returning(columns);

			return row ? SliceSchema.parse(row) : null;
		},

		async saveChangedFiles(opts: { id: string; changedFiles: string[] }): Promise<void> {
			await db.update(slices).set({ changedFiles: opts.changedFiles }).where(eq(slices.id, opts.id));
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
