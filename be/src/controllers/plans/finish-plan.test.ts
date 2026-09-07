import { describe, expect, it, vi } from 'vitest';
import { finishPlan } from 'src/controllers/plans/finish-plan';
import { type AcRepo } from 'src/repos/plans/ac.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type Ac, type Plan } from 'src/types/PlanSchema';

function plan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: 'p_1',
		userId: 'u_alice',
		machineId: 'm_1',
		title: 'A plan',
		bodyMd: '## Overview',
		status: 'planning',
		failureReason: null,
		input: 'make the thing',
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		...overrides
	};
}

function build(opts: { plan: Plan; unassigned: Ac[] }) {
	const update = vi.fn().mockResolvedValue(null);

	return {
		update,
		run: async () =>
			finishPlan({
				planRepo: { update } as unknown as PlanRepo,
				acRepo: {
					listUnassigned: vi.fn().mockResolvedValue(opts.unassigned)
				} as unknown as AcRepo,
				plan: opts.plan
			})
	};
}

function ac(code: string): Ac {
	return { id: `ac_${code}`, planId: 'p_1', code, text: code, sliceId: null, ordinal: 1 };
}

describe('finishPlan', () => {
	it('marks the plan ready when it has a body and every AC is claimed', async () => {
		const { update, run } = build({ plan: plan(), unassigned: [] });

		await run();

		expect(update).toHaveBeenCalledWith({ id: 'p_1', status: 'ready', failureReason: null });
	});

	// The session saying it is finished is not the same as the plan being usable,
	// and an AC no bullet delivers is invisible work rather than a cosmetic gap.
	it('fails the plan when a tracer bullet claims no AC', async () => {
		const { update, run } = build({ plan: plan(), unassigned: [ac('AC-3'), ac('AC-4')] });

		await run();

		expect(update).toHaveBeenCalledWith({
			id: 'p_1',
			status: 'failed',
			failureReason: 'no tracer bullet claims AC-3, AC-4'
		});
	});

	it('fails the plan when the session ended without publishing one', async () => {
		const { update, run } = build({ plan: plan({ title: null, bodyMd: null }), unassigned: [] });

		await run();

		expect(update).toHaveBeenCalledWith({
			id: 'p_1',
			status: 'failed',
			failureReason: 'the session ended without publishing a plan'
		});
	});
});
