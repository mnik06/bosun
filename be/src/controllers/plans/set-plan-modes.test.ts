import { describe, expect, it, vi } from 'vitest';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { setPlanModes } from 'src/controllers/plans/set-plan-modes';
import { type Plan } from 'src/types/PlanSchema';

function plan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: 'p_1',
		projectId: 'pr_1',
		machineId: 'm_1',
		title: null,
		bodyMd: null,
		status: 'planning',
		verifyInUi: true,
		auto: false,
		afk: true,
		...overrides
	} as Plan;
}

function build(current: Plan) {
	const update = vi.fn(async (values: Partial<Plan>) => ({ ...current, ...values }));
	const sendToAgent = vi.fn().mockReturnValue(true);
	const deps = {
		planRepo: { getOwnedById: vi.fn().mockResolvedValue(current), update },
		socketRegistry: { sendToAgent, broadcastToPlan: vi.fn(), broadcastToUi: vi.fn() }
	} as unknown as LineDeps;

	return { deps, update, sendToAgent };
}

describe('setPlanModes', () => {
	it('tells the running grill when its modes change', async () => {
		const { deps, sendToAgent } = build(plan());

		await setPlanModes(deps, { id: 'p_1', projectId: 'pr_1', auto: true });

		expect(sendToAgent).toHaveBeenCalledExactlyOnceWith({
			machineId: 'm_1',
			message: { type: 'plan.modes', planId: 'p_1', verifyInUi: true, auto: true }
		});
	});

	it('leaves the agent alone when only AFK moves', async () => {
		const { deps, sendToAgent, update } = build(plan({ status: 'ready', bodyMd: '## Plan' }));

		await setPlanModes(deps, { id: 'p_1', projectId: 'pr_1', afk: false });

		expect(update).toHaveBeenCalledWith({ id: 'p_1', afk: false });
		expect(sendToAgent).not.toHaveBeenCalled();
	});

	// A published plan's bullets were cut to one verify setting; flipping it after
	// would leave a verify bullet the plan no longer asks for, or none it needs.
	it.each([
		['ready', plan({ status: 'ready', bodyMd: '## Plan' })],
		['revising a written plan', plan({ status: 'planning', bodyMd: '## Plan' })],
		['failed', plan({ status: 'failed' })]
	])('refuses to change the grill modes once %s', async (_case, current) => {
		const { deps, update, sendToAgent } = build(current);

		await expect(setPlanModes(deps, { id: 'p_1', projectId: 'pr_1', verifyInUi: false })).rejects.toMatchObject({
			statusCode: 409
		});
		expect(update).not.toHaveBeenCalled();
		expect(sendToAgent).not.toHaveBeenCalled();
	});
});
