import { describe, expect, it, vi } from 'vitest';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { stallMachineQuickFixes } from 'src/controllers/quick-fixes/stall-machine-quick-fixes';
import { type QuickFix } from 'src/types/QuickFixSchema';

vi.mock('src/controllers/quick-fixes/shared/notify', () => ({ notifyQuickFixStatus: vi.fn() }));

const CONNECTED_AT = new Date('2026-09-29T10:00:00.000Z');

function quickFix(overrides: Partial<QuickFix> & { id: string }): QuickFix {
	return {
		projectId: 'prj_1',
		machineId: 'm_1',
		repositoryId: 'repo_1',
		branch: `bosun/quickfix/${overrides.id}`,
		baseBranch: 'main',
		description: 'fix it',
		status: 'running',
		prUrl: null,
		error: null,
		createdByUserId: 'u_1',
		createdAt: new Date('2026-09-17T18:13:58.000Z'),
		finishedAt: null,
		...overrides
	};
}

function deps(active: QuickFix[]) {
	const settle = vi.fn().mockImplementation((opts: { id: string }) =>
		Promise.resolve(quickFix({ id: opts.id, status: 'failed' }))
	);
	const listActiveForMachine = vi.fn().mockResolvedValue(active);

	return { settle, deps: { quickFixRepo: { listActiveForMachine, settle } } as unknown as LineDeps };
}

describe('stallMachineQuickFixes', () => {
	it('fails a running quick fix the agent no longer holds', async () => {
		const { settle, deps: d } = deps([quickFix({ id: 'qf_gone' })]);

		await stallMachineQuickFixes(d, { machineId: 'm_1', connectedAt: CONNECTED_AT, heldQuickFixIds: [] });

		expect(settle).toHaveBeenCalledWith(expect.objectContaining({ id: 'qf_gone', status: 'failed' }));
	});

	it('leaves a quick fix the agent still holds', async () => {
		const { settle, deps: d } = deps([quickFix({ id: 'qf_held' })]);

		await stallMachineQuickFixes(d, { machineId: 'm_1', connectedAt: CONNECTED_AT, heldQuickFixIds: ['qf_held'] });

		expect(settle).not.toHaveBeenCalled();
	});

	it('leaves a quick fix dispatched over this connection', async () => {
		const { settle, deps: d } = deps([quickFix({ id: 'qf_new', createdAt: new Date('2026-09-29T10:00:01.000Z') })]);

		await stallMachineQuickFixes(d, { machineId: 'm_1', connectedAt: CONNECTED_AT, heldQuickFixIds: [] });

		expect(settle).not.toHaveBeenCalled();
	});

	// An agent that predates the list says nothing about what it holds.
	it('does nothing for an agent too old to report its quick fixes', async () => {
		const { settle, deps: d } = deps([quickFix({ id: 'qf_gone' })]);

		await stallMachineQuickFixes(d, { machineId: 'm_1', connectedAt: CONNECTED_AT });

		expect(settle).not.toHaveBeenCalled();
	});
});
