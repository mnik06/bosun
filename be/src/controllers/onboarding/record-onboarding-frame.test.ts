import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type OnboardingDeps } from 'src/controllers/onboarding/onboarding-deps';
import { recordOnboardingFrame } from 'src/controllers/onboarding/record-onboarding-frame';
import { maybeStartVerify } from 'src/controllers/onboarding/shared/start-verify';
import { getSocketRegistry } from 'src/services/sockets/registry.service';
import { type OnboardingPhase, type OnboardingRun } from 'src/types/OnboardingSchema';

vi.mock('src/controllers/onboarding/shared/start-verify', () => ({ maybeStartVerify: vi.fn() }));
vi.mock('src/controllers/onboarding/shared/notify', () => ({ notifyOnboardingStatus: vi.fn() }));

function discovering(phase: OnboardingPhase): OnboardingRun {
	return { id: 'onb_1', machineId: 'm_1', phase, status: 'discovering', config: 'version: 1' } as unknown as OnboardingRun;
}

function deps(run: OnboardingRun) {
	const update = vi.fn().mockImplementation(async (changes: Partial<OnboardingRun>) => ({ ...run, ...changes }));

	return {
		update,
		onboardingDeps: {
			onboardingRunRepo: { getForMachine: vi.fn().mockResolvedValue(run), update },
			socketRegistry: getSocketRegistry()
		} as unknown as OnboardingDeps
	};
}

async function done(run: OnboardingRun) {
	const { onboardingDeps, update } = deps(run);

	await recordOnboardingFrame(onboardingDeps, {
		machineId: 'm_1',
		projectId: 'prj_1',
		frame: { type: 'onboarding.done', runId: run.id }
	});

	return update;
}

describe('recordOnboardingFrame', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('takes a finished discovery on to inputs and verify', async () => {
		const update = await done(discovering('discover'));

		expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_input' }));
		expect(maybeStartVerify).toHaveBeenCalledOnce();
	});

	// A config run must not start a verify the leader never asked for, nor leave
	// the run waiting on inputs the machine's own onboarding already has.
	it('settles a finished config run at ready without starting verify', async () => {
		const update = await done(discovering('config'));

		expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', portBase: null }));
		expect(maybeStartVerify).not.toHaveBeenCalled();
	});

	it('fails a config run that never published a config', async () => {
		const update = await done({ ...discovering('config'), config: null });

		expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
		expect(maybeStartVerify).not.toHaveBeenCalled();
	});
});
