import { HttpError } from 'src/api/errors/HttpError';
import { announcePlanForBuild, requireMachineBuild } from 'src/controllers/line/agent/shared/agent-build';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type PlanBug, type PlanBugStatus } from 'src/types/BugfixSchema';

// Gated to this build's own running session, named by id: a frame from a
// session that already ended — a race between a round finishing and a person
// pressing "Done" — must not still be able to write. The row flip a session's
// end makes is what is authoritative, never the order frames happen to arrive in.
async function requireRunningSession(deps: LineDeps, opts: { buildId: string; sessionId: string }): Promise<void> {
	const running = await deps.bugfixSessionRepo.getRunningForBuild(opts.buildId);

	if (!running || running.id !== opts.sessionId) {
		throw new HttpError(409, 'this bug-fixing session is no longer running');
	}
}

// Parses to one row per description, appended after whatever this build's list
// already holds — called once per round by `report_bugs`, so a later round's
// pasted bugs simply extend the same list rather than replacing it.
export async function reportBugs(
	deps: LineDeps,
	opts: { buildId: string; machineId: string; sessionId: string; descriptions: string[] }
): Promise<PlanBug[]> {
	const build = await requireMachineBuild(deps, opts);

	await requireRunningSession(deps, { buildId: build.id, sessionId: opts.sessionId });

	const bugs = await deps.planBugRepo.createBatch({
		buildId: build.id,
		rows: opts.descriptions.map((description) => ({ id: deps.idService.createPlanBugId(), description }))
	});

	await announcePlanForBuild(deps, build);

	return bugs;
}

// The only writer of a bug's status: there is no API path a person reaches
// this through, matching `report_finding`/`resolve_finding` for `VerifyFinding`.
export async function updateBugStatus(
	deps: LineDeps,
	opts: { bugId: string; machineId: string; sessionId: string; status: PlanBugStatus; note: string | null }
): Promise<PlanBug> {
	const bug = await deps.planBugRepo.getById(opts.bugId);

	if (!bug) {
		throw new HttpError(404, 'Bug not found');
	}

	const build = await requireMachineBuild(deps, { buildId: bug.buildId, machineId: opts.machineId });

	await requireRunningSession(deps, { buildId: build.id, sessionId: opts.sessionId });

	const updated = await deps.planBugRepo.updateStatus({ id: bug.id, status: opts.status, note: opts.note });

	if (!updated) {
		throw new HttpError(404, 'Bug not found');
	}

	await announcePlanForBuild(deps, build);

	return updated;
}
