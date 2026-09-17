import { type LineDeps } from 'src/controllers/line/line-deps';
import { announceBugfixMessage } from 'src/controllers/plans/bugfix/shared/bugfix-broadcast';
import { endRunningBugfixSession, revertBuildFromBugfix } from 'src/controllers/plans/bugfix/shared/end-bugfix-session';
import { type Build } from 'src/types/BuildSchema';
import { type BugfixSession } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';
import { type AgentMsg } from 'src/types/protocol';

type BugfixFrame = Extract<AgentMsg, { type: `bugfix.${string}` }>;

interface Located {
	build: Build;
	plan: Plan;
	session: BugfixSession;
}

// A frame is acted on only against the session it names, still running: one
// that lost the race with the row flip — a person's "Done", a merge, a cancel,
// the idle sweep, all settling between this text delta leaving the machine and
// arriving here — describes an attempt that is already over, on the same terms
// `record-exec-frame.ts`'s `locate` treats a run no longer `running` as a ghost.
async function locate(deps: LineDeps, opts: { buildId: string; sessionId: string; machineId: string }): Promise<Located | null> {
	const build = await deps.buildRepo.getById(opts.buildId);

	if (!build || build.machineId !== opts.machineId || build.status !== 'fixing_bugs') {
		return null;
	}

	const session = await deps.bugfixSessionRepo.getRunningForBuild(build.id);

	if (!session || session.id !== opts.sessionId) {
		return null;
	}

	const plan = await deps.planRepo.getById(build.planId);

	return plan ? { build, plan, session } : null;
}

// Whatever prose the session produced since its last tool call or terminal
// frame is one complete assistant turn — the same boundary `record-plan-frame.ts`
// flushes planning's transcript on.
async function flushText(deps: LineDeps, opts: { buildId: string; planId: string }): Promise<void> {
	const text = deps.planTextService.take(opts.buildId);

	if (!text) {
		return;
	}

	const message = await deps.bugfixMessageRepo.append({
		id: deps.idService.createBugfixMessageId(),
		buildId: opts.buildId,
		role: 'assistant',
		content: { text }
	});

	announceBugfixMessage({ socketRegistry: deps.socketRegistry, planId: opts.planId, message });
}

async function recordError(deps: LineDeps, opts: { located: Located }): Promise<void> {
	const { build, plan, session } = opts.located;
	const closed = await endRunningBugfixSession(deps, {
		buildId: build.id,
		planId: plan.id,
		machineId: build.machineId,
		session,
		endedReason: 'error'
	});

	if (!closed) {
		return;
	}

	await revertBuildFromBugfix(deps, { build, plan });
}

export async function recordBugfixFrame(deps: LineDeps, opts: { machineId: string; frame: BugfixFrame }): Promise<void> {
	const { frame } = opts;
	const located = await locate(deps, { buildId: frame.buildId, sessionId: frame.sessionId, machineId: opts.machineId });

	if (!located) {
		return;
	}

	deps.socketRegistry.broadcastToPlan({ planId: located.plan.id, message: frame });

	if (frame.type === 'bugfix.text') {
		// Reused rather than duplicated: the service is a plain buffer keyed by
		// whatever id its caller gives it, and a bug-fixing session's is the build's
		// — `plan_bugs`/`bugfix_messages` are scoped to `build_id`, not `plan_id`,
		// so a build is what tells two sessions on the same plan's history apart.
		deps.planTextService.append({ planId: frame.buildId, delta: frame.delta });

		return;
	}

	await flushText(deps, { buildId: frame.buildId, planId: located.plan.id });

	if (frame.type === 'bugfix.error') {
		await recordError(deps, { located });
	}
}
