import { describe, expect, it, vi } from 'vitest';
import { createDiscoveryDispatch, describePublishAnswer, ReportRequirementArgsSchema } from './tools';
import { type BosunApiService } from '../../services/bosun-api.service';

function dispatchWith(answer: unknown) {
	const onPublished = vi.fn();
	const bosunApi = {
		publishOnboardingConfig: vi.fn().mockResolvedValue(answer),
		reportOnboardingRequirement: vi.fn().mockResolvedValue({ ok: true })
	} as unknown as BosunApiService;
	const dispatch = createDiscoveryDispatch({ runId: 'onb_1', bosunApi, onPublished })(new Map());

	return { dispatch, onPublished, bosunApi };
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
