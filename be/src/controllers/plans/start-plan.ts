import { HttpError } from 'src/api/errors/HttpError';
import { announcePlan } from 'src/controllers/plans/shared/plan-broadcast';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type PlanMessageRepo } from 'src/repos/plans/plan-message.repo';
import { type PlanRepo } from 'src/repos/plans/plan.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type Plan } from 'src/types/PlanSchema';

const REQUIRED_CHECKS = ['claude'];

function hostingRefusal(machine: Machine): string | null {
	if (machine.status === 'paused') {
		return 'this machine is paused';
	}

	if (machine.status !== 'online') {
		return 'this machine is offline';
	}

	if (!machine.capabilities) {
		return 'this machine has not reported preflight yet';
	}

	const failed = REQUIRED_CHECKS.filter(
		(name) => !machine.capabilities?.find((check) => check.name === name)?.ok
	);

	return failed.length > 0 ? `preflight is red: ${failed.join(', ')}` : null;
}

export async function startPlan(opts: {
	planRepo: PlanRepo;
	planMessageRepo: PlanMessageRepo;
	machineRepo: MachineRepo;
	idService: IdService;
	socketRegistry: SocketRegistry;
	userId: string;
	machineId: string;
	input: string;
	verifyInUi: boolean;
	auto: boolean;
}): Promise<Plan> {
	const machine = await opts.machineRepo.getOwnedById({
		id: opts.machineId,
		userId: opts.userId
	});

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	const refusal = hostingRefusal(machine);

	// Refused before anything is written, so a machine that cannot host a session
	// does not leave a plan row behind that will sit in `planning` forever.
	if (refusal) {
		throw new HttpError(409, refusal);
	}

	if (!opts.socketRegistry.getAgentSocket(machine.id)) {
		throw new HttpError(409, 'this machine is offline');
	}

	const plan = await opts.planRepo.create({
		id: opts.idService.createPlanId(),
		userId: opts.userId,
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
			auto: opts.auto
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
