import { HttpError } from 'src/api/errors/HttpError';
import { admitBugfixSession } from 'src/controllers/line/shared/bugfix-admission';
import { announceBuild } from 'src/controllers/line/shared/announce';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBugfixMessage } from 'src/controllers/plans/bugfix/shared/bugfix-broadcast';
import { getOwnedPlan } from 'src/controllers/plans/shared/plan-access';
import { requireHost } from 'src/controllers/plans/shared/plan-hosting';
import { type Build } from 'src/types/BuildSchema';
import { type BugfixSession } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';

function refuseTerminal(build: Build): void {
	if (build.status === 'merged') {
		throw new HttpError(409, 'this plan has already merged');
	}

	if (build.status === 'cancelled') {
		throw new HttpError(409, 'this plan has been cancelled');
	}
}

// The build a bug-fixing session continues: whatever build a plan's pull
// request lives on, whether or not that build is still going anywhere.
async function currentBuild(deps: LineDeps, plan: Plan): Promise<Build> {
	const latest = await deps.buildRepo.latestForPlans([plan.id]);
	const build = latest.get(plan.id) ?? null;

	if (!build || build.prNumber === null) {
		throw new HttpError(409, 'this plan has no pull request to fix bugs on');
	}

	refuseTerminal(build);

	return build;
}

async function appendMessage(deps: LineDeps, opts: { plan: Plan; buildId: string; text: string }): Promise<void> {
	const message = await deps.bugfixMessageRepo.append({
		id: deps.idService.createBugfixMessageId(),
		buildId: opts.buildId,
		role: 'user',
		content: { text: opts.text }
	});

	announceBugfixMessage({ socketRegistry: deps.socketRegistry, planId: opts.plan.id, message });
}

// Another turn on the same live process, on the same terms as the plan's own
// chat: a message mid-round is delivered as the next input, never refused by
// the orchestrator's own state. The machine is checked first, matching
// `sayToPlan` — a message nothing can act on is refused at the button rather
// than written to the transcript and silently never delivered.
async function continueSession(deps: LineDeps, opts: { plan: Plan; build: Build; session: BugfixSession; text: string }): Promise<void> {
	if (!opts.build.machineId || !deps.socketRegistry.getAgentSocket(opts.build.machineId)) {
		throw new HttpError(409, 'this machine is offline');
	}

	await appendMessage(deps, { plan: opts.plan, buildId: opts.build.id, text: opts.text });

	deps.socketRegistry.sendToAgent({
		machineId: opts.build.machineId,
		message: { type: 'bugfix.say', sessionId: opts.session.id, buildId: opts.build.id, text: opts.text }
	});
}

// Claims the build's worktree the same way its first build slot was claimed:
// the status transition is what only one caller can win, and `in_review` is,
// by construction, the one status that already guarantees nothing else of the
// build is running.
async function startSession(deps: LineDeps, opts: { plan: Plan; build: Build; userId: string; text: string }): Promise<void> {
	if (opts.build.status !== 'in_review') {
		throw new HttpError(409, 'this build has another job running in its worktree');
	}

	const machine = await requireHost({
		machineRepo: deps.machineRepo,
		socketRegistry: deps.socketRegistry,
		machineId: opts.build.machineId!,
		projectId: opts.plan.projectId
	});
	const admission = await admitBugfixSession(deps, { machine });

	if (!admission.admitted) {
		throw new HttpError(409, 'this machine has no room to run a bug-fixing session right now');
	}

	const claimed = await deps.buildRepo.transition({ id: opts.build.id, from: ['in_review'], changes: { status: 'fixing_bugs' } });

	if (!claimed) {
		throw new HttpError(409, 'this build has another job running in its worktree');
	}

	announceBuild({ socketRegistry: deps.socketRegistry, projectId: opts.plan.projectId, build: claimed });

	const session = await deps.bugfixSessionRepo.start({
		id: deps.idService.createBugfixSessionId(),
		buildId: claimed.id,
		startedByUserId: opts.userId
	});

	await appendMessage(deps, { plan: opts.plan, buildId: claimed.id, text: opts.text });

	const acs = await deps.acRepo.listByPlan(opts.plan.id);

	deps.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: {
			type: 'bugfix.start',
			sessionId: session.id,
			buildId: claimed.id,
			worktreePath: claimed.worktreePath!,
			branch: claimed.branch!,
			planNumber: opts.plan.number,
			planTitle: opts.plan.title ?? 'Untitled plan',
			planBodyMd: opts.plan.bodyMd ?? '',
			acs: acs.map((ac) => ({ code: ac.code, text: ac.text })),
			text: opts.text
		}
	});
}

// Sending a message when no session is live starts one; sending one while a
// session is already running continues it. Never both at once — the running
// session's row is checked before the claim is attempted.
export async function sayToBugfix(deps: LineDeps, opts: { id: string; projectId: string; userId: string; text: string }): Promise<void> {
	const plan = await getOwnedPlan({ planRepo: deps.planRepo, id: opts.id, projectId: opts.projectId });
	const build = await currentBuild(deps, plan);
	const running = await deps.bugfixSessionRepo.getRunningForBuild(build.id);

	if (running) {
		return continueSession(deps, { plan, build, session: running, text: opts.text });
	}

	return startSession(deps, { plan, build, userId: opts.userId, text: opts.text });
}
