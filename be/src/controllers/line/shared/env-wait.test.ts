import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleRepository } from 'src/controllers/line/schedule';
import { envSatisfied, resumeEnvBuilds } from 'src/controllers/line/shared/env-wait';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { type Build, type SliceRun } from 'src/types/BuildSchema';
import { type Machine } from 'src/types/MachineSchema';

vi.mock('src/controllers/line/schedule', () => ({ scheduleRepository: vi.fn() }));

const SET = { path: 'apps/api', keys: ['DATABASE_URL', 'STRIPE_KEY'], updatedAt: '2026-01-01T00:00:00.000Z' };

describe('envSatisfied', () => {
	it('holds only when every named key is held under its own path', () => {
		expect(envSatisfied({ missingEnv: [{ path: 'apps/api', keys: ['STRIPE_KEY'] }], envSets: [SET] })).toBe(true);
		expect(envSatisfied({ missingEnv: [{ path: 'apps/api', keys: ['STRIPE_KEY', 'OTHER'] }], envSets: [SET] })).toBe(false);
		expect(envSatisfied({ missingEnv: [{ path: 'apps/web', keys: ['STRIPE_KEY'] }], envSets: [SET] })).toBe(false);
	});
});

describe('resumeEnvBuilds', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function build(changes: Partial<Build>): Build {
		return { id: 'bld_1', planId: 'p_1', repositoryId: 'repo_1', status: 'needs_you', needsYouReason: 'env', builtAt: null, missingEnv: [{ path: 'apps/api', keys: ['STRIPE_KEY'] }], ...changes } as Build;
	}

	function setup(builds: Build[], runs: Partial<SliceRun>[]) {
		const transition = vi.fn().mockImplementation(async (opts: { id: string; changes: Partial<Build> }) => ({ ...builds.find((entry) => entry.id === opts.id), ...opts.changes }));

		return {
			transition,
			deps: {
				buildRepo: { listForMachine: vi.fn().mockResolvedValue(builds), transition },
				planRepo: { getById: vi.fn().mockResolvedValue({ id: 'p_1', projectId: 'prj_1' }) },
				sliceRunRepo: { listForBuild: vi.fn().mockResolvedValue(runs) },
				integrationRepo: { listForBuild: vi.fn().mockResolvedValue([]) },
				socketRegistry: getSocketRegistry()
			} as unknown as LineDeps
		};
	}

	const machine = { id: 'm_1', envSets: [SET] } as unknown as Machine;

	it('sends a build back to where it waited once the machine holds what it named', async () => {
		const { deps, transition } = setup([build({}), build({ id: 'bld_2', missingEnv: [{ path: 'apps/api', keys: ['NOT_YET'] }] })], [{ phase: null, status: 'pending' }]);

		await resumeEnvBuilds(deps, { machine });

		expect(transition).toHaveBeenCalledOnce();
		expect(transition).toHaveBeenCalledWith({
			id: 'bld_1',
			from: ['needs_you'],
			changes: { status: 'scheduled', needsYouReason: null, failureReason: null, missingEnv: null }
		});
		expect(scheduleRepository).toHaveBeenCalledWith(deps, { repositoryId: 'repo_1' });
	});

	// A drive that stopped for a key goes back to the verify line, not the build line.
	it('puts a built plan back in line to verify', async () => {
		const { deps, transition } = setup([build({ builtAt: new Date() })], [{ phase: 'drive', status: 'pending' }]);

		await resumeEnvBuilds(deps, { machine });

		expect(transition).toHaveBeenCalledWith(expect.objectContaining({ changes: expect.objectContaining({ status: 'waiting_verify' }) }));
	});

	it('leaves a build waiting on something else alone', async () => {
		const { deps, transition } = setup([build({ needsYouReason: 'checks' })], []);

		await resumeEnvBuilds(deps, { machine });

		expect(transition).not.toHaveBeenCalled();
		expect(scheduleRepository).not.toHaveBeenCalled();
	});
});
