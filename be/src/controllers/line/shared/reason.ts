import { dependencyReleased, describeWait } from 'src/controllers/line/shared/dependencies';
import { type BuildState, type RepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { type BuildStatus, type NeedsYouReason } from 'src/types/BuildSchema';

const NEEDS_YOU: Record<NeedsYouReason, string> = {
	overlap: 'needs you: an overlap decision',
	integration: 'needs you: a sync failed',
	checks: 'needs you: checks still red after a repair',
	provider_failed: 'needs you: a plan it waits on stopped',
	recheck_failed: 'needs you: a criterion failed its re-check',
	worktree: 'needs you: its worktree could not be set up'
};

const RUNNING: Partial<Record<BuildStatus, string>> = {
	driving: 'driving the criteria',
	fixing: 'fixing what the drive found',
	rechecking: 're-checking what the fix repaired',
	waiting_answer: 'waiting on your answer'
};

const SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

function ordinal(rank: number): string {
	const teen = rank % 100 >= 11 && rank % 100 <= 13;

	return `${rank}${teen ? 'th' : SUFFIXES[rank % 10] ?? 'th'}`;
}

function building(state: BuildState): string {
	const bullets = state.runs.filter((run) => run.phase === null);
	const done = bullets.filter((run) => run.status === 'done').length;

	return `bullet ${Math.min(done + 1, bullets.length)} of ${bullets.length}`;
}

function inReview(state: BuildState): string {
	const latest = state.integrations.filter((integration) => integration.status === 'done').at(-1);
	const pr = state.build.prNumber === null ? 'pull request pending' : `PR #${state.build.prNumber}`;

	if (latest?.resolved.length) {
		return `${pr} · conflict resolved`;
	}

	const regenerated = latest?.regenerated.find((entry) => entry.files.length > 0);

	return regenerated ? `${pr} · ${regenerated.name} regenerated` : pr;
}

function scheduled(state: BuildState, snapshot: RepositorySnapshot): string {
	const waits = state.dependencies.filter((dependency) => !dependencyReleased({ dependency, provider: snapshot.providers.get(dependency.providerPlanId) }));

	if (waits.length > 0) {
		return waits.map((dependency) => describeWait({ dependency, provider: snapshot.providers.get(dependency.providerPlanId) })).join(', ');
	}

	const line = snapshot.states.filter((entry) => entry.build.status === 'scheduled').sort((a, b) => a.build.position - b.build.position);

	return `${ordinal(line.findIndex((entry) => entry.build.id === state.build.id) + 1)} in line`;
}

function waitingVerify(state: BuildState, verifyLine: BuildState[]): string {
	const rank = verifyLine.findIndex((entry) => entry.build.id === state.build.id);

	return rank === -1 ? 'waiting for a slot to verify' : `${ordinal(rank + 1)} to verify`;
}

// The one line a card carries: what it waits for, or where it stands.
export function describeReason(opts: { state: BuildState; snapshot: RepositorySnapshot; verifyLine: BuildState[] }): string | null {
	const { state } = opts;
	const { build } = state;

	switch (build.status) {
	case 'scheduled':
		return scheduled(state, opts.snapshot);
	case 'held':
		return build.failureReason ?? 'held';
	case 'building':
		return building(state);
	case 'integrating':
		return `syncing with ${state.integrations.find((integration) => integration.status !== 'done')?.onto ?? build.baseBranch ?? 'its base'}`;
	case 'waiting_verify':
		return waitingVerify(state, opts.verifyLine);
	case 'in_review':
		return inReview(state);
	case 'needs_you':
		return build.needsYouReason === null ? 'needs you' : NEEDS_YOU[build.needsYouReason];
	case 'failed':
		return build.failureReason;
	default:
		return RUNNING[build.status] ?? null;
	}
}
