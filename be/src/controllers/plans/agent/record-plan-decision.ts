import { HttpError } from 'src/api/errors/HttpError';
import { type PlanDecisionRepo } from 'src/repos/plans/plan-decision.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type PlanDecision } from 'src/types/PlanSchema';

export async function recordPlanDecision(opts: {
	planRepo: PlanRepo;
	planDecisionRepo: PlanDecisionRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	planId: string;
	machineId: string;
	sliceId: string | null;
	fork: string;
	options: string | null;
	chose: string;
	blastRadius: string | null;
	reversing: string | null;
}): Promise<PlanDecision> {
	const plan = await opts.planRepo.getByIdForMachine({
		id: opts.planId,
		machineId: opts.machineId
	});

	if (!plan) {
		throw new HttpError(404, 'Plan not found');
	}

	const decision = await opts.planDecisionRepo.create({
		id: opts.idService.createPlanDecisionId(),
		planId: plan.id,
		sliceId: opts.sliceId,
		fork: opts.fork,
		options: opts.options,
		chose: opts.chose,
		blastRadius: opts.blastRadius,
		reversing: opts.reversing
	});

	// Pushed as it lands rather than collected at the end: a queue running
	// overnight is watched by somebody reading what it decided, not waiting for a
	// pull request to find out.
	opts.socketRegistry.broadcastToUi({
		projectId: plan.projectId,
		message: { type: 'plan.decision', planId: plan.id, decision }
	});

	return decision;
}
