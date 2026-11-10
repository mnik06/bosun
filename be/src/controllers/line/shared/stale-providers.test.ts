import { describe, expect, it } from 'vitest';
import { type BuildState, type RepositorySnapshot } from 'src/controllers/line/shared/line-snapshot';
import { staleProviders } from 'src/controllers/line/shared/stale-providers';
import { type BuildStatus, type IntegrationStatus } from 'src/types/BuildSchema';

function state(opts: {
	number: number;
	status?: BuildStatus;
	integrations?: IntegrationStatus[];
	providers?: number[];
	overridden?: number[];
}): BuildState {
	const dependency = (provider: number) => ({
		planId: `p_${opts.number}`,
		providerPlanId: `p_${provider}`,
		overriddenAt: opts.overridden?.includes(provider) ? new Date() : null
	});

	return {
		plan: { id: `p_${opts.number}`, number: opts.number },
		build: { id: `bld_${opts.number}`, status: opts.status ?? 'in_review' },
		runs: [],
		integrations: (opts.integrations ?? ['done']).map((status) => ({ status })),
		dependencies: (opts.providers ?? []).map(dependency)
	} as unknown as BuildState;
}

function staleFor(candidate: BuildState, others: BuildState[]): number[] {
	return staleProviders({ state: candidate, snapshot: { states: [candidate, ...others] } as unknown as RepositorySnapshot });
}

describe('staleProviders', () => {
	it('names a provider with an integration queued, running or stuck', () => {
		const candidate = state({ number: 9, status: 'scheduled', providers: [1, 2, 3, 4] });

		expect(
			staleFor(candidate, [
				state({ number: 1, integrations: ['done', 'pending'] }),
				state({ number: 2, integrations: ['running'] }),
				state({ number: 3, integrations: ['needs_you'] }),
				state({ number: 4, integrations: ['done'] })
			])
		).toEqual([1, 2, 3]);
	});

	// The provider's own branch is fine, but it stacks on a plan still catching up
	// with the default branch: its copy of the base is just as stale.
	it('names a provider stacked on a plan that is catching up', () => {
		const candidate = state({ number: 9, status: 'scheduled', providers: [3] });

		expect(staleFor(candidate, [state({ number: 3, status: 'building', providers: [2] }), state({ number: 2, integrations: ['running'] })])).toEqual([3]);
	});

	it('ignores a merged provider, and one the person ran anyway', () => {
		const candidate = state({ number: 9, status: 'scheduled', providers: [1, 2], overridden: [2] });

		expect(
			staleFor(candidate, [state({ number: 1, status: 'merged', integrations: ['pending'] }), state({ number: 2, integrations: ['pending'] })])
		).toEqual([]);
	});

	it('terminates on a dependency cycle', () => {
		const candidate = state({ number: 9, status: 'scheduled', providers: [1] });

		expect(staleFor(candidate, [state({ number: 1, providers: [2] }), state({ number: 2, providers: [1] })])).toEqual([]);
	});
});
