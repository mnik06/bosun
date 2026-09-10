import { describe, expect, it, vi } from 'vitest';
import { stallMachinePlans } from 'src/controllers/plans/stall-machine-plans';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type PlanTextService } from 'src/services/plans/plan-text.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

const CONNECTED_AT = new Date('2026-01-01T12:00:00.000Z');

function plan(overrides: Partial<Plan> = {}): Plan {
	return {
		id: 'p_1',
		projectId: 'pr_1',
		machineId: 'm_1',
		title: null,
		bodyMd: null,
		status: 'planning',
		failureReason: null,
		input: 'make the thing',
		createdAt: new Date('2026-01-01T11:00:00.000Z'),
		...overrides
	};
}

function build(opts: { running: Plan[]; heldPlanIds?: string[] }) {
	const failMany = vi.fn().mockResolvedValue([]);
	const sendToAgent = vi.fn().mockReturnValue(true);

	return {
		failMany,
		sendToAgent,
		run: async () =>
			stallMachinePlans({
				planRepo: {
					listPlanningOnMachine: vi.fn().mockResolvedValue(opts.running),
					failMany
				} as unknown as PlanRepo,
				planTextService: { drop: vi.fn() } as unknown as PlanTextService,
				socketRegistry: { sendToAgent, broadcastToUi: vi.fn() } as unknown as SocketRegistry,
				machineId: 'm_1',
				connectedAt: CONNECTED_AT,
				heldPlanIds: opts.heldPlanIds
			})
	};
}

describe('stallMachinePlans', () => {
	// The whole point of the session outliving its socket: a grill the agent is
	// still holding must survive the reconnect that used to fail it.
	it('leaves a plan the agent still holds alone', async () => {
		const { failMany, run } = build({ running: [plan()], heldPlanIds: ['p_1'] });

		await run();

		expect(failMany).not.toHaveBeenCalled();
	});

	it('fails a plan the agent no longer holds', async () => {
		const { failMany, run } = build({ running: [plan()], heldPlanIds: [] });

		await run();

		expect(failMany).toHaveBeenCalledWith({
			ids: ['p_1'],
			reason: expect.stringContaining('agent restarted')
		});
	});

	// The agent assembles `hello` before it can have registered a session for a
	// plan dispatched over this very connection.
	it('spares a plan created after this connection opened', async () => {
		const { failMany, run } = build({
			running: [plan({ createdAt: new Date('2026-01-01T12:00:01.000Z') })],
			heldPlanIds: []
		});

		await run();

		expect(failMany).not.toHaveBeenCalled();
	});

	// An agent too old to report holds nothing across a reconnect, so absent means
	// absent rather than unknown.
	it('fails everything when the agent reports no held plans at all', async () => {
		const { failMany, run } = build({ running: [plan()] });

		await run();

		expect(failMany).toHaveBeenCalledWith({ ids: ['p_1'], reason: expect.any(String) });
	});

	// A `claude` holding a port and a credential for a plan nobody will read is
	// the orphan this exists to prevent.
	it('cancels a session the agent holds for a plan that is no longer running', async () => {
		const { sendToAgent, run } = build({ running: [], heldPlanIds: ['p_gone'] });

		await run();

		expect(sendToAgent).toHaveBeenCalledWith({
			machineId: 'm_1',
			message: { type: 'plan.cancel', planId: 'p_gone' }
		});
	});
});
