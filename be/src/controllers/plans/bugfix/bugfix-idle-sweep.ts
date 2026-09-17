import { type FastifyBaseLogger } from 'fastify';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { endRunningBugfixSession, revertBuildFromBugfix } from 'src/controllers/plans/bugfix/shared/end-bugfix-session';

// AC-23: "no new chat message for the idle timeout". A day, on the same terms
// as a planning session's own cap — long enough that nobody mid-testing loses
// their session to a lunch break, short enough that a build slot a person
// walked away from does not sit claimed for good.
export const BUGFIX_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const SWEEP_MS = 10 * 60 * 1000;

async function endIdleSession(deps: LineDeps, opts: { buildId: string }): Promise<void> {
	const build = await deps.buildRepo.getById(opts.buildId);
	const session = build ? await deps.bugfixSessionRepo.getRunningForBuild(build.id) : null;

	// Settled by something else between the listing above and here — a person's
	// "Done", a merge, a cancel — in the time the sweep took to reach it.
	if (!build || !session || build.status !== 'fixing_bugs') {
		return;
	}

	const plan = await deps.planRepo.getById(build.planId);

	if (!plan) {
		return;
	}

	const closed = await endRunningBugfixSession(deps, {
		buildId: build.id,
		planId: plan.id,
		machineId: build.machineId,
		session,
		endedReason: 'idle_timeout'
	});

	if (!closed) {
		return;
	}

	await revertBuildFromBugfix(deps, { build, plan });
}

export async function sweepIdleBugfixSessions(deps: LineDeps, opts: { now: Date }): Promise<void> {
	const running = await deps.bugfixSessionRepo.listRunning();

	for (const session of running) {
		const latest = await deps.bugfixMessageRepo.latestForBuild(session.buildId);
		const lastActivity = latest?.createdAt ?? session.createdAt;

		if (opts.now.getTime() - lastActivity.getTime() >= BUGFIX_IDLE_TIMEOUT_MS) {
			await endIdleSession(deps, { buildId: session.buildId });
		}
	}
}

// Nothing else ends a bug-fixing session nobody is looking at any more: a
// person's own "Done" is a choice, a merge and a cancel are events, but silence
// has no event to hang off, so this is the only clock that reaches it.
export function startBugfixIdleSweep(opts: { deps: LineDeps; log: FastifyBaseLogger }): () => void {
	const timer = setInterval(() => {
		void sweepIdleBugfixSessions(opts.deps, { now: new Date() }).catch((error: unknown) => {
			opts.log.error({ error }, 'failed sweeping idle bug-fixing sessions');
		});
	}, SWEEP_MS);

	timer.unref();

	return () => {
		clearInterval(timer);
	};
}
