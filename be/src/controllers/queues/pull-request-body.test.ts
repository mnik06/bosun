import { describe, expect, it } from 'vitest';
import { pullRequestBody } from 'src/controllers/queues/pull-request-body';
import { type Ac, type Plan } from 'src/types/PlanSchema';

function plan(overrides: Partial<Plan> = {}): Plan {
	return { number: 12, bodyMd: null, summary: null, ...overrides } as Plan;
}

function ac(overrides: Partial<Ac>): Ac {
	return { code: 'AC-1', text: 'It works', verified: true, blockedReason: null, ...overrides } as Ac;
}

function body(overrides: Parameters<typeof pullRequestBody>[0] | Partial<Parameters<typeof pullRequestBody>[0]> = {}) {
	return pullRequestBody({
		plan: plan(),
		acs: [],
		decisions: [],
		verifyReport: null,
		planUrl: 'https://bosun.test/plans/p_1?tab=execution',
		...overrides
	});
}

describe('pullRequestBody', () => {
	// GitHub refuses a body over 65536 characters, and it refuses it after the
	// branch is pushed: the work lands and the pull request never exists.
	it('stays under what GitHub accepts however long the plan was', () => {
		const result = body({
			plan: plan({ bodyMd: 'x'.repeat(200_000) }),
			acs: Array.from({ length: 400 }, (_, index) =>
				ac({ code: `AC-${index}`, text: 'y'.repeat(500), verified: false, blockedReason: 'z'.repeat(500) })
			),
			verifyReport: 'w'.repeat(200_000)
		});

		expect(result.length).toBeLessThanOrEqual(65_536);
	});

	it('links back to the plan on the execution tab', () => {
		expect(body()).toContain('https://bosun.test/plans/p_1?tab=execution');
	});

	// The summary session's headline is written for exactly this: one line saying
	// what shipped. The plan document is what blew the limit.
	it('opens with the summary headline when there is one', () => {
		const result = body({
			plan: plan({
				bodyMd: 'The whole plan document',
				summary: { headline: 'Partners master data screen', areas: [] }
			})
		});

		expect(result).toContain('Partners master data screen');
		expect(result).not.toContain('The whole plan document');
	});

	it('falls back to the first paragraph of the plan when nothing summarised it', () => {
		const result = body({ plan: plan({ bodyMd: 'What this does.\n\nEvery detail of how.' }) });

		expect(result).toContain('What this does.');
		expect(result).not.toContain('Every detail of how.');
	});

	// A criterion nobody could drive is the part of the verdict the branch cannot
	// show, so it is named with its reason while the rest are a tally.
	it('names the criteria that could not be driven and counts the rest', () => {
		const result = body({
			acs: [
				ac({ code: 'AC-1' }),
				ac({ code: 'AC-2' }),
				ac({ code: 'AC-3', verified: false, blockedReason: 'no browser on the machine' })
			]
		});

		expect(result).toContain('**2 of 3 verified.**');
		expect(result).toContain('AC-3');
		expect(result).toContain('no browser on the machine');
		expect(result).not.toContain('AC-1');
	});

	it('counts criteria nobody accounted for', () => {
		const result = body({ acs: [ac({ code: 'AC-1', verified: false })] });

		expect(result).toContain('neither verified nor explained');
	});
});
