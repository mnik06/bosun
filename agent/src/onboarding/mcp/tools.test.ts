import { describe, expect, it, vi } from 'vitest';
import { createDiscoveryDispatch, describePublishAnswer, ReportRequirementArgsSchema } from './tools';
import { type BosunApiService } from '../../services/bosun-api.service';

function dispatchWith(answer: unknown, branches: string[] = []) {
	const onPublished = vi.fn();
	const calls: string[] = [];
	const bosunApi = {
		publishOnboardingConfig: vi.fn().mockResolvedValue(answer),
		reportOnboardingRequirement: vi.fn().mockResolvedValue({ ok: true }),
		suggestOnboardingBaseBranch: vi.fn().mockImplementation(() => {
			calls.push('suggest');

			return Promise.resolve({ ok: true });
		})
	} as unknown as BosunApiService;
	const scratch = {
		exists: vi.fn((branch: string) => Promise.resolve(branches.includes(branch))),
		checkout: vi.fn(() => {
			calls.push('checkout');

			return Promise.resolve(null);
		})
	};
	const dispatch = createDiscoveryDispatch({ runId: 'onb_1', bosunApi, scratch, onPublished, advance: () => null })(new Map());

	return { dispatch, onPublished, bosunApi, scratch, calls };
}

describe('publish_config', () => {
	// Discovery succeeds only on an accepted publish, so a refusal that counted as
	// one would send the run to needs_input with no config behind it.
	it('counts only an accepted config as published', async () => {
		const refused = dispatchWith({ ok: false, issues: [{ path: 'apps.fe.start', message: 'Required' }] });
		const result = (await refused.dispatch('publish_config', { yaml: 'version: 1' })) as { content: { text: string }[]; isError: boolean };

		expect(refused.onPublished).not.toHaveBeenCalled();
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain('- apps.fe.start: Required');

		const accepted = dispatchWith({ ok: true });

		await accepted.dispatch('publish_config', { yaml: 'version: 1' });
		expect(accepted.onPublished).toHaveBeenCalledOnce();
	});

	it('does not read an unrecognised answer as a success', () => {
		expect(describePublishAnswer({ status: 'ok' }).published).toBe(false);
	});
});

describe('report_requirement', () => {
	it('refuses an env requirement without the folder its .env lives in', () => {
		expect(ReportRequirementArgsSchema.safeParse({ kind: 'env', key: 'DATABASE_URL', why: 'w', evidence: 'e' }).success).toBe(false);
		expect(ReportRequirementArgsSchema.safeParse({ kind: 'secret', key: 'PASSWORD', why: 'w', evidence: 'e' }).success).toBe(true);
	});

	it('sends a missing path as null', async () => {
		const { dispatch, bosunApi } = dispatchWith({ ok: true });

		await dispatch('report_requirement', { kind: 'policy', key: 'applyMigrations', why: 'w', evidence: 'e' });

		expect(bosunApi.reportOnboardingRequirement).toHaveBeenCalledWith(expect.objectContaining({ path: null, kind: 'policy' }));
	});
});

describe('suggest_base_branch', () => {
	type ToolResult = { content: { text: string }[]; isError: boolean };

	it('refuses a branch origin does not have, without recording or switching', async () => {
		const { dispatch, bosunApi, scratch } = dispatchWith(null, ['develop']);
		const result = (await dispatch('suggest_base_branch', { branch: 'devlop', reason: 'main is a stub' })) as ToolResult;

		expect(result.isError).toBe(true);
		expect(bosunApi.suggestOnboardingBaseBranch).not.toHaveBeenCalled();
		expect(scratch.checkout).not.toHaveBeenCalled();
	});

	// A tree switched to before bosun knows is a config written for a branch that
	// verify never runs on.
	it('records the suggestion before switching the checkout', async () => {
		const { dispatch, calls } = dispatchWith(null, ['develop']);
		const result = (await dispatch('suggest_base_branch', { branch: 'develop', reason: 'main is a stub' })) as ToolResult;

		expect(result.isError).toBe(false);
		expect(calls).toEqual(['suggest', 'checkout']);
	});

	it.each(['--upload-pack=x', '-b', 'main/', 'a..b', 'x.lock'])('refuses %s before it reaches git', async (branch) => {
		const { dispatch, scratch } = dispatchWith(null, [branch]);

		await expect(dispatch('suggest_base_branch', { branch, reason: 'r' })).rejects.toThrow();
		expect(scratch.exists).not.toHaveBeenCalled();
	});
});
