import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { requireHost } from 'src/controllers/plans/shared/plan-hosting';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Plan } from 'src/types/PlanSchema';

export async function startPlan(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	machineRepo: MachineRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	projectId: string;
	createdByUserId: string;
	machineId: string;
	input: string;
	verifyInUi: boolean;
	auto: boolean;
}): Promise<Plan> {
	const machine = await requireHost({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machineId: opts.machineId,
		projectId: opts.projectId
	});

	const plan = await opts.planRepo.create({
		id: opts.idService.createPlanId(),
		projectId: opts.projectId,
		createdByUserId: opts.createdByUserId,
		machineId: machine.id,
		input: opts.input,
		verifyInUi: opts.verifyInUi,
		auto: opts.auto
	});

	await opts.planMessageRepo.append({
		id: opts.idService.createPlanMessageId(),
		planId: plan.id,
		role: 'user',
		content: { text: opts.input }
	});

	const dispatched = opts.socketRegistry.sendToAgent({
		machineId: machine.id,
		message: {
			type: 'plan.start',
			planId: plan.id,
			input: opts.input,
			verifyInUi: opts.verifyInUi,
			auto: opts.auto,
			notes: machine.projectProfile?.notes ?? null
		}
	});

	if (!dispatched) {
		const failed = await opts.planRepo.update({
			id: plan.id,
			status: 'failed',
			failureReason: 'the machine went offline before the session started'
		});

		announcePlan({ socketRegistry: opts.socketRegistry, plan: failed ?? plan });

		return failed ?? plan;
	}

	announcePlan({ socketRegistry: opts.socketRegistry, plan });

	return plan;
}
