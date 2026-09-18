import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { nextJob, waitingStatus } from 'src/controllers/line/shared/next-job';
import { announceBugfixMessage } from 'src/controllers/plans/bugfix/shared/bugfix-broadcast';
import { type Build } from 'src/types/BuildSchema';
import { type BugfixSession, type BugfixSessionEndedReason } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';

// Every way a session ends without a person choosing to end it. A bug still
// `pending`/`fixing` when one of these hits has no path back to being
// revisited — a later session on this build gets only the text of a new
// message, never the existing list, and nothing else ever re-touches a bug's
// status — so leaving it alone here is not a softer failure, it is a bug
// stuck forever with no way to mark it resolved. All four fail it, unlike a
// person's own "Done", which is not a failure at all.
const NON_USER_ENDING: Record<Exclude<BugfixSessionEndedReason, 'user_closed'>, { chat: string; bugNote: string }> = {
	merged: {
		chat: 'This session ended because the pull request was merged while it was still working.',
		bugNote: 'the pull request was merged while this bug-fixing session was still working on it'
	},
	cancelled: {
		chat: 'This session ended because the build was cancelled while it was still working.',
		bugNote: 'the build was cancelled while this bug-fixing session was still working on it'
	},
	idle_timeout: {
		chat: 'This session ended after a day with no new message.',
		bugNote: 'this bug-fixing session ended after a day with no new message, before this bug was resolved'
	},
	error: {
		chat: 'This session ended unexpectedly.',
		bugNote: 'this bug-fixing session ended unexpectedly before this bug was resolved'
	}
};

// Closes a live session's row and, on any ending but a person's own "Done",
// fails whatever it never got to and tells the chat why. What each caller
// does with the build's own status is its own: `close-bugfix.ts` and the idle
// sweep revert it to whatever it was waiting for, a cancel or a merge is
// about to set it to something terminal regardless, so neither of those
// repeats that work here.
export async function endRunningBugfixSession(
	deps: LineDeps,
	opts: {
		buildId: string;
		planId: string;
		machineId: string | null;
		session: BugfixSession;
		endedReason: BugfixSessionEndedReason;
	}
): Promise<BugfixSession | null> {
	const closed = await deps.bugfixSessionRepo.close({ id: opts.session.id, endedReason: opts.endedReason });

	if (!closed) {
		return null;
	}

	if (opts.endedReason !== 'user_closed') {
		const { chat, bugNote } = NON_USER_ENDING[opts.endedReason];

		await deps.planBugRepo.failUnresolved({ buildId: opts.buildId, note: bugNote });

		const message = await deps.bugfixMessageRepo.append({
			id: deps.idService.createBugfixMessageId(),
			buildId: opts.buildId,
			role: 'system',
			content: { text: chat }
		});

		announceBugfixMessage({ socketRegistry: deps.socketRegistry, planId: opts.planId, message });
	}

	if (opts.machineId !== null) {
		deps.socketRegistry.sendToAgent({
			machineId: opts.machineId,
			message: { type: 'bugfix.cancel', sessionId: opts.session.id, buildId: opts.buildId }
		});
	}

	return closed;
}

// Where the build goes once a session that does not itself set a terminal
// status has ended it — a person's "Done", the idle sweep, or the session
// erroring out on its own. Shared by every one of those, and by nobody else:
// a cancel or a merge sets its own terminal status right after
// `endRunningBugfixSession` returns, so repeating this there would only
// immediately be overwritten.
export async function revertBuildFromBugfix(deps: LineDeps, opts: { build: Build; plan: Plan }): Promise<Build | null> {
	const [runs, integrations] = await Promise.all([
		deps.sliceRunRepo.listForBuild(opts.build.id),
		deps.integrationRepo.listForBuild(opts.build.id)
	]);
	const status = waitingStatus({ build: opts.build, job: nextJob({ runs, integrations }) });
	const reverted = await deps.buildRepo.transition({ id: opts.build.id, from: ['fixing_bugs'], changes: { status, needsYouReason: null } });

	if (!reverted) {
		return null;
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, build: reverted });

	if (reverted.machineId !== null) {
		await scheduleMachine(deps, { machineId: reverted.machineId });
	}

	return reverted;
}
