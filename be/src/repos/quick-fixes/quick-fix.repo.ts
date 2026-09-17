import { and, eq, inArray } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { quickFixes } from 'src/services/drizzle/schema';
import { QuickFixSchema, type QuickFix, type QuickFixStatus } from 'src/types/QuickFixSchema';

const columns = {
	id: quickFixes.id,
	projectId: quickFixes.projectId,
	machineId: quickFixes.machineId,
	repositoryId: quickFixes.repositoryId,
	branch: quickFixes.branch,
	baseBranch: quickFixes.baseBranch,
	description: quickFixes.description,
	status: quickFixes.status,
	prUrl: quickFixes.prUrl,
	error: quickFixes.error,
	createdByUserId: quickFixes.createdByUserId,
	createdAt: quickFixes.createdAt,
	finishedAt: quickFixes.finishedAt
};

// What a machine's capacity accounting counts as held: a quick fix nobody has
// settled yet, on the same terms `BUILD_SLOT_STATUSES` and `ACTIVE_ONBOARDING_STATUSES`
// hold their own tables to.
export const ACTIVE_QUICK_FIX_STATUSES: QuickFixStatus[] = ['running'];

export function getQuickFixRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			projectId: string;
			machineId: string;
			repositoryId: string;
			branch: string;
			baseBranch: string;
			description: string;
			createdByUserId: string;
		}): Promise<QuickFix> {
			const [row] = await db.insert(quickFixes).values(opts).returning(columns);

			return QuickFixSchema.parse(row);
		},

		// Reached from an agent frame: the machine is part of the lookup, so a session
		// cannot settle another machine's quick fix by naming its id.
		async getForMachine(opts: { id: string; machineId: string }): Promise<QuickFix | null> {
			const [row] = await db
				.select(columns)
				.from(quickFixes)
				.where(and(eq(quickFixes.id, opts.id), eq(quickFixes.machineId, opts.machineId)));

			return row ? QuickFixSchema.parse(row) : null;
		},

		async listActiveForMachine(machineId: string): Promise<QuickFix[]> {
			const rows = await db
				.select(columns)
				.from(quickFixes)
				.where(and(eq(quickFixes.machineId, machineId), inArray(quickFixes.status, ACTIVE_QUICK_FIX_STATUSES)));

			return rows.map((row) => QuickFixSchema.parse(row));
		},

		// The status move is the claim, on the same terms as `builds.transition`: only
		// a quick fix still `running` takes a terminal frame, so a retried or duplicate
		// frame cannot settle the same row twice.
		async settle(opts: {
			id: string;
			status: Extract<QuickFixStatus, 'pushed' | 'failed'>;
			prUrl?: string | null;
			error?: string | null;
		}): Promise<QuickFix | null> {
			const { id, ...changes } = opts;
			const [row] = await db
				.update(quickFixes)
				.set({ ...changes, finishedAt: new Date() })
				.where(and(eq(quickFixes.id, id), eq(quickFixes.status, 'running')))
				.returning(columns);

			return row ? QuickFixSchema.parse(row) : null;
		}
	};
}

export type QuickFixRepo = ReturnType<typeof getQuickFixRepo>;
