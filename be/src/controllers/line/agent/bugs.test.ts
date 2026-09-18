import { describe, expect, it, vi } from 'vitest';
import { HttpError } from 'src/api/errors/HttpError';
import { reportBugs, updateBugStatus } from 'src/controllers/line/agent/bugs';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { getIdService } from 'src/services/ids/id.service';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { type Build } from 'src/types/BuildSchema';
import { type BugfixSession, type PlanBug } from 'src/types/BugfixSchema';
import { type Plan } from 'src/types/PlanSchema';

const PLAN: Plan = { id: 'p_1', projectId: 'prj_1' } as unknown as Plan;

const BUILD: Build = { id: 'bld_1', planId: PLAN.id, machineId: 'm_1' } as unknown as Build;

const RUNNING_SESSION: BugfixSession = {
	id: 'bfs_live',
	buildId: BUILD.id,
	status: 'running',
	endedReason: null,
	startedByUserId: 'u_1',
	createdAt: new Date(),
	endedAt: null
};

function bug(overrides: Partial<PlanBug> = {}): PlanBug {
	return {
		id: 'bug_1',
		buildId: BUILD.id,
		seq: 1,
		description: 'the button does nothing',
		status: 'pending',
		note: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

const CREATED_BUG = bug();

function deps(opts: { theBuild: Build | null; running: BugfixSession | null; theBug?: PlanBug | null }) {
	const createBatch = vi.fn().mockResolvedValue([CREATED_BUG]);
	const updateStatus = vi.fn().mockResolvedValue(bug({ status: 'fixing' }));

	const lineDeps = {
		buildRepo: { getById: vi.fn().mockResolvedValue(opts.theBuild) },
		bugfixSessionRepo: { getRunningForBuild: vi.fn().mockResolvedValue(opts.running) },
		planBugRepo: {
			createBatch,
			getById: vi.fn().mockResolvedValue(opts.theBug === undefined ? bug() : opts.theBug),
			updateStatus
		},
		planRepo: { getById: vi.fn().mockResolvedValue(PLAN) },
		idService: getIdService(),
		socketRegistry: getSocketRegistry()
	} as unknown as LineDeps;

	return { lineDeps, createBatch, updateStatus };
}

describe('reportBugs', () => {
	it('creates one bug per description on the build, gated to its running session', async () => {
		const { lineDeps, createBatch } = deps({ theBuild: BUILD, running: RUNNING_SESSION });

		const result = await reportBugs(lineDeps, {
			buildId: BUILD.id,
			machineId: 'm_1',
			sessionId: RUNNING_SESSION.id,
			descriptions: ['the button does nothing', 'the page crashes on load']
		});

		expect(createBatch).toHaveBeenCalledWith({
			buildId: BUILD.id,
			rows: [
				{ id: expect.any(String), description: 'the button does nothing' },
				{ id: expect.any(String), description: 'the page crashes on load' }
			]
		});
		expect(result).toEqual([CREATED_BUG]);
	});

	it('refuses a build this machine does not own', async () => {
		const { lineDeps, createBatch } = deps({ theBuild: { ...BUILD, machineId: 'm_2' } as Build, running: RUNNING_SESSION });

		await expect(
			reportBugs(lineDeps, { buildId: BUILD.id, machineId: 'm_1', sessionId: RUNNING_SESSION.id, descriptions: ['x'] })
		).rejects.toThrow(new HttpError(404, 'Build not found'));
		expect(createBatch).not.toHaveBeenCalled();
	});

	it('refuses when no session is running for this build', async () => {
		const { lineDeps, createBatch } = deps({ theBuild: BUILD, running: null });

		await expect(
			reportBugs(lineDeps, { buildId: BUILD.id, machineId: 'm_1', sessionId: RUNNING_SESSION.id, descriptions: ['x'] })
		).rejects.toThrow(new HttpError(409, 'this bug-fixing session is no longer running'));
		expect(createBatch).not.toHaveBeenCalled();
	});

	it('refuses a frame from a session that already ended and a new one replaced', async () => {
		const other: BugfixSession = { ...RUNNING_SESSION, id: 'bfs_new' };
		const { lineDeps, createBatch } = deps({ theBuild: BUILD, running: other });

		await expect(
			reportBugs(lineDeps, { buildId: BUILD.id, machineId: 'm_1', sessionId: RUNNING_SESSION.id, descriptions: ['x'] })
		).rejects.toThrow(new HttpError(409, 'this bug-fixing session is no longer running'));
		expect(createBatch).not.toHaveBeenCalled();
	});
});

describe('updateBugStatus', () => {
	it('moves a bug to fixing, gated to its build\'s running session', async () => {
		const { lineDeps, updateStatus } = deps({ theBuild: BUILD, running: RUNNING_SESSION });

		const result = await updateBugStatus(lineDeps, {
			bugId: 'bug_1',
			machineId: 'm_1',
			sessionId: RUNNING_SESSION.id,
			status: 'fixing',
			note: null
		});

		expect(updateStatus).toHaveBeenCalledWith({ id: 'bug_1', status: 'fixing', note: null });
		expect(result.status).toBe('fixing');
	});

	it('refuses a bug that does not exist', async () => {
		const { lineDeps, updateStatus } = deps({ theBuild: BUILD, running: RUNNING_SESSION, theBug: null });

		await expect(
			updateBugStatus(lineDeps, { bugId: 'bug_missing', machineId: 'm_1', sessionId: RUNNING_SESSION.id, status: 'fixed', note: 'done' })
		).rejects.toThrow(new HttpError(404, 'Bug not found'));
		expect(updateStatus).not.toHaveBeenCalled();
	});

	it('refuses when this machine does not own the bug\'s build', async () => {
		const { lineDeps, updateStatus } = deps({ theBuild: { ...BUILD, machineId: 'm_2' } as Build, running: RUNNING_SESSION });

		await expect(
			updateBugStatus(lineDeps, { bugId: 'bug_1', machineId: 'm_1', sessionId: RUNNING_SESSION.id, status: 'fixed', note: 'done' })
		).rejects.toThrow(new HttpError(404, 'Build not found'));
		expect(updateStatus).not.toHaveBeenCalled();
	});

	it('refuses once the session that owns this bug has ended', async () => {
		const { lineDeps, updateStatus } = deps({ theBuild: BUILD, running: null });

		await expect(
			updateBugStatus(lineDeps, { bugId: 'bug_1', machineId: 'm_1', sessionId: RUNNING_SESSION.id, status: 'failed', note: 'gave up' })
		).rejects.toThrow(new HttpError(409, 'this bug-fixing session is no longer running'));
		expect(updateStatus).not.toHaveBeenCalled();
	});
});
