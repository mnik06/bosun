import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { type DbOrTx } from 'src/services/drizzle/drizzle.service';
import { onboardingRuns } from 'src/services/drizzle/schema';
import {
	OnboardingRunSchema,
	type OnboardingAssumption,
	type OnboardingPhase,
	type OnboardingRequirement,
	type OnboardingRun,
	type OnboardingStatus,
	type OnboardingStep
} from 'src/types/OnboardingSchema';

const columns = {
	id: onboardingRuns.id,
	repositoryId: onboardingRuns.repositoryId,
	machineId: onboardingRuns.machineId,
	phase: onboardingRuns.phase,
	status: onboardingRuns.status,
	portBase: onboardingRuns.portBase,
	steps: onboardingRuns.steps,
	requirements: onboardingRuns.requirements,
	assumptions: onboardingRuns.assumptions,
	config: onboardingRuns.config,
	suggestedBaseBranch: onboardingRuns.suggestedBaseBranch,
	suggestedBaseBranchReason: onboardingRuns.suggestedBaseBranchReason,
	failureReason: onboardingRuns.failureReason,
	startedAt: onboardingRuns.startedAt,
	finishedAt: onboardingRuns.finishedAt
};

export const ACTIVE_ONBOARDING_STATUSES: OnboardingStatus[] = ['discovering', 'verifying'];

export function getOnboardingRunRepo(db: DbOrTx) {
	return {
		async create(opts: {
			id: string;
			repositoryId: string;
			machineId: string;
			phase: OnboardingPhase;
			status: OnboardingStatus;
			portBase: number | null;
			requirements?: OnboardingRequirement[];
			assumptions?: OnboardingAssumption[];
			config?: string | null;
		}): Promise<OnboardingRun> {
			const [row] = await db.insert(onboardingRuns).values(opts).returning(columns);

			return OnboardingRunSchema.parse(row);
		},

		async getById(id: string): Promise<OnboardingRun | null> {
			const [row] = await db.select(columns).from(onboardingRuns).where(eq(onboardingRuns.id, id));

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		// Reached from an agent route: the machine is part of the lookup, so a session
		// cannot write into another machine's run by naming its id.
		async getForMachine(opts: { id: string; machineId: string }): Promise<OnboardingRun | null> {
			const [row] = await db
				.select(columns)
				.from(onboardingRuns)
				.where(and(eq(onboardingRuns.id, opts.id), eq(onboardingRuns.machineId, opts.machineId)));

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		async latestForMachine(machineId: string): Promise<OnboardingRun | null> {
			const [row] = await db
				.select(columns)
				.from(onboardingRuns)
				.where(eq(onboardingRuns.machineId, machineId))
				.orderBy(desc(onboardingRuns.startedAt))
				.limit(1);

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		// The discovery a second machine's verify takes its requirements from: the
		// latest one that actually published a config, not the latest that started.
		async latestDiscoveryForRepository(repositoryId: string): Promise<OnboardingRun | null> {
			const [row] = await db
				.select(columns)
				.from(onboardingRuns)
				.where(
					and(
						eq(onboardingRuns.repositoryId, repositoryId),
						eq(onboardingRuns.phase, 'discover'),
						isNotNull(onboardingRuns.config)
					)
				)
				.orderBy(desc(onboardingRuns.startedAt))
				.limit(1);

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		async latestPerMachineForRepository(repositoryId: string): Promise<OnboardingRun[]> {
			const rows = await db
				.selectDistinctOn([onboardingRuns.machineId], columns)
				.from(onboardingRuns)
				.where(eq(onboardingRuns.repositoryId, repositoryId))
				.orderBy(onboardingRuns.machineId, desc(onboardingRuns.startedAt));

			return rows.map((row) => OnboardingRunSchema.parse(row));
		},

		async listActiveForMachine(machineId: string): Promise<OnboardingRun[]> {
			const rows = await db
				.select(columns)
				.from(onboardingRuns)
				.where(
					and(eq(onboardingRuns.machineId, machineId), inArray(onboardingRuns.status, ACTIVE_ONBOARDING_STATUSES))
				);

			return rows.map((row) => OnboardingRunSchema.parse(row));
		},

		// Broader than `listActiveForMachine`: a run stuck on `needs_input` has not
		// finished either, and a machine going offline under it is exactly what a
		// leader needs to hear about.
		async listUnfinishedForMachine(machineId: string): Promise<OnboardingRun[]> {
			const rows = await db
				.select(columns)
				.from(onboardingRuns)
				.where(and(eq(onboardingRuns.machineId, machineId), isNull(onboardingRuns.finishedAt)));

			return rows.map((row) => OnboardingRunSchema.parse(row));
		},

		async update(opts: {
			id: string;
			status?: OnboardingStatus;
			portBase?: number | null;
			requirements?: OnboardingRequirement[];
			assumptions?: OnboardingAssumption[];
			config?: string | null;
			suggestedBaseBranch?: string;
			suggestedBaseBranchReason?: string;
			failureReason?: string | null;
			finishedAt?: Date | null;
			steps?: OnboardingStep[];
		}): Promise<OnboardingRun | null> {
			const { id, ...changes } = opts;
			const [row] = await db
				.update(onboardingRuns)
				.set(changes)
				.where(eq(onboardingRuns.id, id))
				.returning(columns);

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		// Appended in the statement rather than read and rewritten: progress lines
		// arrive one after another and a read-modify-write pair would drop one.
		async appendStep(opts: { id: string; step: OnboardingStep }): Promise<OnboardingRun | null> {
			const [row] = await db
				.update(onboardingRuns)
				.set({ steps: sql`${onboardingRuns.steps} || ${JSON.stringify([opts.step])}::jsonb` })
				.where(eq(onboardingRuns.id, opts.id))
				.returning(columns);

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		// One statement, like `appendStep`: a session reports several requirements in
		// one turn, concurrently, and reading the list to write it back would let the
		// second write drop the first — an input the form never asks for and verify
		// starts without. The same kind, path and key reported again replaces the
		// earlier entry rather than listing one input twice.
		async upsertRequirement(opts: { id: string; requirement: OnboardingRequirement }): Promise<OnboardingRun | null> {
			const { kind, path, key } = opts.requirement;
			const [row] = await db
				.update(onboardingRuns)
				.set({
					requirements: sql`(select coalesce(jsonb_agg(entry), '[]'::jsonb) from jsonb_array_elements(${onboardingRuns.requirements}) as entry where not (entry->>'kind' = ${kind} and coalesce(entry->>'path', '') = ${path ?? ''} and entry->>'key' = ${key})) || ${JSON.stringify([opts.requirement])}::jsonb`
				})
				.where(eq(onboardingRuns.id, opts.id))
				.returning(columns);

			return row ? OnboardingRunSchema.parse(row) : null;
		},

		async appendAssumption(opts: { id: string; assumption: OnboardingAssumption }): Promise<OnboardingRun | null> {
			const [row] = await db
				.update(onboardingRuns)
				.set({ assumptions: sql`${onboardingRuns.assumptions} || ${JSON.stringify([opts.assumption])}::jsonb` })
				.where(eq(onboardingRuns.id, opts.id))
				.returning(columns);

			return row ? OnboardingRunSchema.parse(row) : null;
		}
	};
}

export type OnboardingRunRepo = ReturnType<typeof getOnboardingRunRepo>;
