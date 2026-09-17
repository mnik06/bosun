import { HttpError } from 'src/api/errors/HttpError';
import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type Machine } from 'src/types/MachineSchema';

// A lower cap or a new lane changes what the machine admits now, not on the next
// bullet that happens to settle.
export async function saveMachineCapacity(
	deps: LineDeps,
	opts: {
		id: string;
		projectId: string;
		verifyLanes?: number;
		buildCap?: number | null;
		ignoreMemoryBudget?: boolean;
	}
): Promise<Machine> {
	const machine = await deps.machineRepo.saveCapacity(opts);

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	announceMachine({ socketRegistry: deps.socketRegistry, machine });
	await scheduleMachine(deps, { machineId: machine.id });

	return machine;
}
