import { describe, expect, it, vi } from 'vitest';
import { controlBuild } from 'src/controllers/line/control-build';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { type Build, type SliceRun } from 'src/types/BuildSchema';
import { type Plan } from 'src/types/PlanSchema';

const PLAN = { id: 'p_1', projectId: 'prj_1' } as unknown as Plan;

function build(overrides: Partial<Build>): Build {
	return {
		id: 'bld_1',
		planId: PLAN.id,
		repositoryId: 'repo_1',
		status: 'in_review',
		needsYouReason: null,
		builtAt: new Date(),
		...overrides
	} as unknown as Build;
}

function run(overrides: Partial<SliceRun>): SliceRun {
	return { id: 'sr_1', sliceId: 'sl_1', ordinal: 1, phase: null, status: 'done', ...overrides } as unknown as SliceRun;
}

const BUILT_AND_VERIFIED = [run({ id: 'sr_bullet' }), run({ id: 'sr_drive', sliceId: 'sl_verify', ordinal: 2, phase: 'drive' })];

function deps(opts: { theBuild: Build; runs: SliceRun[] }) {
	// Resolves to no build, so a call that gets this far ends in the 404 after it.
	const transaction = vi.fn().mockResolvedValue(null);

	return {
		transaction,
		lineDeps: {
			buildRepo: { getOwnedById: vi.fn().mockResolvedValue(opts.theBuild) },
			planRepo: { getOwnedById: vi.fn().mockResolvedValue(PLAN) },
			sliceRunRepo: { listForBuild: vi.fn().mockResolvedValue(opts.runs) },
			db: { transaction }
		} as unknown as LineDeps
	};
}

async function reverify(opts: { theBuild: Build; runs?: SliceRun[] }) {
	const { lineDeps, transaction } = deps({ theBuild: opts.theBuild, runs: opts.runs ?? BUILT_AND_VERIFIED });
	const result = controlBuild(lineDeps, { id: 'bld_1', projectId: 'prj_1', action: 'reverify' });

	return { result, transaction };
}

// Rebuilding the verify slice deletes findings and verdicts, so every refusal has
// to land before the transaction that does it.
describe('controlBuild reverify', () => {
	it.each(['building', 'driving', 'fixing', 'fixing_bugs', 'merged', 'cancelled'] as const)('refuses a %s build', async (status) => {
		const { result, transaction } = await reverify({ theBuild: build({ status }) });

		await expect(result).rejects.toMatchObject({ statusCode: 409 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it('refuses a build waiting on an overlap decision', async () => {
		const { result, transaction } = await reverify({ theBuild: build({ status: 'needs_you', needsYouReason: 'overlap' }) });

		await expect(result).rejects.toMatchObject({ statusCode: 409 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it('refuses a failed build whose bullets are not all built', async () => {
		const { result, transaction } = await reverify({
			theBuild: build({ status: 'failed' }),
			runs: [run({ status: 'failed' }), run({ id: 'sr_drive', ordinal: 2, phase: 'drive', status: 'pending' })]
		});

		await expect(result).rejects.toMatchObject({ statusCode: 409 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it('refuses a plan with no verify slice', async () => {
		const { result, transaction } = await reverify({ theBuild: build({}), runs: [run({})] });

		await expect(result).rejects.toMatchObject({ statusCode: 409 });
		expect(transaction).not.toHaveBeenCalled();
	});

	it.each([
		['in_review', null],
		['failed', null],
		['needs_you', 'recheck_failed']
	] as const)('rebuilds the verify slice of a %s build', async (status, needsYouReason) => {
		const { result, transaction } = await reverify({ theBuild: build({ status, needsYouReason }) });

		await expect(result).rejects.toMatchObject({ statusCode: 404 });
		expect(transaction).toHaveBeenCalledOnce();
	});
});
