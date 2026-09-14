import { type Build, type PlanDependency, type SliceRun } from 'src/types/BuildSchema';

export interface ProviderState {
	planId: string;
	number: number;
	title: string | null;
	// The provider's newest build, whatever its status.
	build: Build | null;
	runs: SliceRun[];
}

function landed(opts: { runs: SliceRun[]; sliceId: string }): SliceRun | undefined {
	return opts.runs.find((run) => run.sliceId === opts.sliceId && run.phase === null && run.status === 'done');
}

// A dependency on a foundation bullet releases when that bullet lands; one on a
// whole feature when the provider has finished building. A merged provider releases
// everything, and "Run anyway" releases what a person chose to release.
export function dependencyReleased(opts: { dependency: PlanDependency; provider: ProviderState | undefined }): boolean {
	const { dependency, provider } = opts;

	if (dependency.overriddenAt !== null) {
		return true;
	}

	const build = provider?.build ?? null;

	if (build === null) {
		return false;
	}

	if (build.status === 'merged') {
		return true;
	}

	if (dependency.providerSliceId !== null) {
		return landed({ runs: provider!.runs, sliceId: dependency.providerSliceId }) !== undefined;
	}

	return build.builtAt !== null;
}

// A provider that stopped before giving what was waited on. Nothing will release
// the dependency on its own, so the dependent goes to a person.
export function providerStopped(opts: { dependency: PlanDependency; provider: ProviderState | undefined }): boolean {
	const status = opts.provider?.build?.status;

	return (
		!dependencyReleased(opts) &&
		(status === 'failed' || status === 'cancelled')
	);
}

export function describeWait(opts: { dependency: PlanDependency; provider: ProviderState | undefined }): string {
	const number = opts.provider?.number;
	const label = number === undefined ? 'another plan' : `#${number}`;

	if (!opts.provider?.build) {
		return `waits for ${label} to be approved`;
	}

	return opts.dependency.providerSliceId === null ? `after ${label} finishes building` : `after ${label}'s foundation`;
}

function activeProviders(opts: { dependencies: PlanDependency[]; providers: Map<string, ProviderState> }): ProviderState[] {
	const ids = new Set(
		opts.dependencies.filter((dependency) => dependency.overriddenAt === null).map((dependency) => dependency.providerPlanId)
	);

	return [...ids]
		.map((id) => opts.providers.get(id))
		.filter(
			(provider): provider is ProviderState =>
				provider?.build !== null &&
				provider?.build !== undefined &&
				provider.build.status !== 'merged' &&
				provider.build.branch !== null
		);
}

// The provider branches a stacked build keeps merging before each of its bullets.
export function providerBranches(opts: { dependencies: PlanDependency[]; providers: Map<string, ProviderState> }): string[] {
	return activeProviders(opts).map((provider) => provider.build!.branch!);
}

function satisfyingCommit(opts: { dependencies: PlanDependency[]; provider: ProviderState }): string | null {
	const own = opts.dependencies.filter((dependency) => dependency.providerPlanId === opts.provider.planId);
	const commits = opts.provider.runs.filter((run) => run.phase === null && run.status === 'done' && run.commitSha !== null);

	if (own.some((dependency) => dependency.providerSliceId === null)) {
		return commits.at(-1)?.commitSha ?? null;
	}

	const slices = new Set(own.map((dependency) => dependency.providerSliceId));

	return commits.filter((run) => slices.has(run.sliceId)).at(-1)?.commitSha ?? null;
}

// Decided when a build takes its first slot. With no unmerged provider it starts
// from the default branch; with one, from that provider's branch at the commit that
// satisfied the dependency — never from `origin/<base>`, which does not contain the
// provider's work until somebody merges it; with several, from the default branch
// with each provider's branch merged in.
export function startingPoint(opts: {
	dependencies: PlanDependency[];
	providers: Map<string, ProviderState>;
	defaultBranch: string;
}): { baseBranch: string; startFrom: string | null; mergeIn: string[] } {
	const active = activeProviders(opts);

	if (active.length === 0) {
		return { baseBranch: opts.defaultBranch, startFrom: null, mergeIn: [] };
	}

	if (active.length === 1) {
		const provider = active[0]!;

		return {
			baseBranch: provider.build!.branch!,
			startFrom: satisfyingCommit({ dependencies: opts.dependencies, provider }) ?? provider.build!.branch!,
			mergeIn: []
		};
	}

	return { baseBranch: opts.defaultBranch, startFrom: null, mergeIn: active.map((provider) => provider.build!.branch!) };
}
