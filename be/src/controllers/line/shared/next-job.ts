import { type Build, type BuildStatus, type Integration, type SliceRun } from 'src/types/BuildSchema';

// A build does one thing at a time in its worktree, and what that thing is follows
// from its pending work rather than from a status: an integration first, then the
// earliest pending run — build bullets by ordinal, then the verify slice's phases in
// the order they were created.
type NextJob =
	| { kind: 'integration'; integration: Integration }
	| { kind: 'bullet'; run: SliceRun }
	| { kind: 'fix'; run: SliceRun }
	| { kind: 'lane'; run: SliceRun }
	| null;

// Statuses that hold a build slot on their machine — `building` between its own
// bullets too, which is the point: switching plans between bullets spreads every
// pull request out without finishing any sooner. The one yield is to a verify that
// cannot fit beside it (`holderBlocksLane`).
export const BUILD_SLOT_STATUSES: BuildStatus[] = ['building', 'integrating', 'fixing'];

export const LANE_STATUSES: BuildStatus[] = ['driving', 'rechecking'];

// Statuses a build waits for admission in.
export const WAITING_STATUSES: BuildStatus[] = ['scheduled', 'waiting_verify', 'in_review'];

export function nextJob(opts: { runs: SliceRun[]; integrations: Integration[] }): NextJob {
	const integration = opts.integrations.find((entry) => entry.status === 'pending');

	if (integration) {
		return { kind: 'integration', integration };
	}

	const run = opts.runs.find((entry) => entry.status === 'pending');

	if (!run) {
		return null;
	}

	if (run.phase === null) {
		return { kind: 'bullet', run };
	}

	return run.phase === 'fix' ? { kind: 'fix', run } : { kind: 'lane', run };
}

export function hasRunningJob(opts: { runs: SliceRun[]; integrations: Integration[] }): boolean {
	return (
		opts.runs.some((entry) => entry.status === 'running') ||
		opts.integrations.some((entry) => entry.status === 'running')
	);
}

// Where a build that is not holding anything waits, given what it has to do next.
// Used wherever a build comes off a hold, an answer, a retry or a finished job.
export function waitingStatus(opts: { build: Pick<Build, 'builtAt'>; job: NextJob }): BuildStatus {
	const { job } = opts;

	if (job === null) {
		return opts.build.builtAt === null ? 'scheduled' : 'in_review';
	}

	if (job.kind === 'bullet') {
		return 'scheduled';
	}

	if (job.kind === 'integration') {
		return opts.build.builtAt === null ? 'scheduled' : 'waiting_verify';
	}

	return 'waiting_verify';
}
