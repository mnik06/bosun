import { and, asc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { builds, integrations, repositories, sliceRuns, slices } from 'src/services/drizzle/schema';
import {
	RunPhaseSchema,
	SliceRunSchema,
	type RunAnswer,
	type RunPhase,
	type SliceRun,
	type SliceRunStatus
} from 'src/types/BuildSchema';
import { SliceKindSchema, type PlanQuestion, type SliceKind } from 'src/types/PlanSchema';

const columns = {
	id: sliceRuns.id,
	buildId: sliceRuns.buildId,
	sliceId: sliceRuns.sliceId,
	ordinal: sliceRuns.ordinal,
	phase: sliceRuns.phase,
	status: sliceRuns.status,
	questionId: sliceRuns.questionId,
	question: sliceRuns.question,
	questionAskedAt: sliceRuns.questionAskedAt,
	answer: sliceRuns.answer,
	acCodes: sliceRuns.acCodes,
	commitSha: sliceRuns.commitSha,
	report: sliceRuns.report,
	failureReason: sliceRuns.failureReason,
	createdAt: sliceRuns.createdAt,
	startedAt: sliceRuns.startedAt,
	finishedAt: sliceRuns.finishedAt
};

// Exported so the statement can be asserted without a database. One worktree holds
// one session, and a bullet, a verify phase and an integration all run in the
// build's worktree — so nothing starts beside anything else of the same build.
export function nothingRunningForBuild(buildId: string) {
	return sql`not exists (select 1 from ${sliceRuns} where build_id = ${buildId} and status = 'running') and not exists (select 1 from ${integrations} where build_id = ${buildId} and status = 'running')`;
}

export interface RunningJob {
	runId: string;
	buildId: string;
	kind: SliceKind;
	phase: RunPhase | null;
}

export interface RunChanges {
	status?: SliceRunStatus;
	questionId?: string | null;
	question?: PlanQuestion[] | null;
	questionAskedAt?: Date | null;
	answer?: RunAnswer | null;
	commitSha?: string | null;
	report?: string | null;
	failureReason?: string | null;
	startedAt?: Date | null;
	finishedAt?: Date | null;
}

export function getSliceRunRepo(db: DbOrTx) {
	return {
		async createMany(
			rows: { id: string; buildId: string; sliceId: string; ordinal: number; phase: RunPhase | null; acCodes?: string[] | null }[]
		): Promise<SliceRun[]> {
			if (rows.length === 0) {
				return [];
			}

			const created = await db.insert(sliceRuns).values(rows).returning(columns);

			return created.map((row) => SliceRunSchema.parse(row));
		},

		// Ordinal first, then creation: a verify slice's drive, fix and re-check share
		// its ordinal and run in the order they were created.
		async listForBuild(buildId: string): Promise<SliceRun[]> {
			const rows = await db
				.select(columns)
				.from(sliceRuns)
				.where(eq(sliceRuns.buildId, buildId))
				.orderBy(asc(sliceRuns.ordinal), asc(sliceRuns.createdAt));

			return rows.map((row) => SliceRunSchema.parse(row));
		},

		async listForBuilds(buildIds: string[]): Promise<SliceRun[]> {
			if (buildIds.length === 0) {
				return [];
			}

			const rows = await db
				.select(columns)
				.from(sliceRuns)
				.where(inArray(sliceRuns.buildId, buildIds))
				.orderBy(asc(sliceRuns.ordinal), asc(sliceRuns.createdAt));

			return rows.map((row) => SliceRunSchema.parse(row));
		},

		async getById(id: string): Promise<SliceRun | null> {
			const [row] = await db.select(columns).from(sliceRuns).where(eq(sliceRuns.id, id));

			return row ? SliceRunSchema.parse(row) : null;
		},

		// Every session in flight on a machine, by the kind of memory it holds. A run
		// waiting on a question is still `running` here, and rightly: its session is
		// alive and holding its memory until the question releases it.
		async listRunningForMachine(machineId: string): Promise<RunningJob[]> {
			const rows = await db
				.select({ runId: sliceRuns.id, buildId: sliceRuns.buildId, kind: slices.kind, phase: sliceRuns.phase })
				.from(sliceRuns)
				.innerJoin(builds, eq(builds.id, sliceRuns.buildId))
				.innerJoin(slices, eq(slices.id, sliceRuns.sliceId))
				.where(and(eq(builds.machineId, machineId), eq(sliceRuns.status, 'running')));

			return rows.map((row) => ({
				runId: row.runId,
				buildId: row.buildId,
				kind: SliceKindSchema.parse(row.kind),
				phase: row.phase === null ? null : RunPhaseSchema.parse(row.phase)
			}));
		},

		// Both guards are load-bearing: the status clause stops two callers taking the
		// same row, and the build clause stops them starting two sessions in one
		// worktree.
		async claim(opts: { id: string; buildId: string }): Promise<SliceRun | null> {
			const [row] = await db
				.update(sliceRuns)
				.set({ status: 'running', startedAt: new Date(), finishedAt: null, failureReason: null })
				.where(
					and(
						eq(sliceRuns.id, opts.id),
						eq(sliceRuns.buildId, opts.buildId),
						eq(sliceRuns.status, 'pending'),
						nothingRunningForBuild(opts.buildId)
					)
				)
				.returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		},

		async update(opts: { id: string } & RunChanges): Promise<SliceRun | null> {
			const { id, ...changes } = opts;
			const [row] = await db.update(sliceRuns).set(changes).where(eq(sliceRuns.id, id)).returning(columns);

			return row ? SliceRunSchema.parse(row) : null;
		},

		// A retry keeps what landed and re-arms what did not. The `done` runs hold
		// commits that are already on the branch.
		async resetUnfinished(buildId: string): Promise<number> {
			const rows = await db
				.update(sliceRuns)
				.set({
					status: 'pending',
					failureReason: null,
					questionId: null,
					question: null,
					questionAskedAt: null,
					startedAt: null,
					finishedAt: null
				})
				.where(and(eq(sliceRuns.buildId, buildId), inArray(sliceRuns.status, ['failed', 'running'])))
				.returning({ id: sliceRuns.id });

			return rows.length;
		},

		async listQuestionsAskedBefore(before: Date): Promise<SliceRun[]> {
			const rows = await db
				.select(columns)
				.from(sliceRuns)
				.where(
					and(
						eq(sliceRuns.status, 'running'),
						isNotNull(sliceRuns.questionId),
						lt(sliceRuns.questionAskedAt, before)
					)
				);

			return rows.map((row) => SliceRunSchema.parse(row));
		},

		async listOpenQuestionsForProject(projectId: string): Promise<SliceRun[]> {
			const rows = await db
				.select(columns)
				.from(sliceRuns)
				.innerJoin(builds, eq(builds.id, sliceRuns.buildId))
				.innerJoin(repositories, eq(repositories.id, builds.repositoryId))
				.where(and(eq(repositories.projectId, projectId), isNotNull(sliceRuns.questionId)));

			return rows.map((row) => SliceRunSchema.parse(row));
		}
	};
}

export type SliceRunRepo = ReturnType<typeof getSliceRunRepo>;
