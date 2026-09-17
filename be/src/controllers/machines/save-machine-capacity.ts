import { type LineDeps } from 'src/controllers/line/line-deps';
import { scheduleMachine } from 'src/controllers/line/schedule';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type Machine } from 'src/types/MachineSchema';
import { orNotFound } from 'src/utils/general';

// A lower cap or a new lane changes what the machine admits now, not on the next
// bullet that happens to settle.
export async function saveMachineCapacity(
	deps: LineDeps,
	opts: { id: string; projectId: string; verifyLanes?: number; buildCap?: number | null }
): Promise<Machine> {
	const machine = await orNotFound(deps.machineRepo.saveCapacity(opts), 'Machine not found');

	announceMachine({ socketRegistry: deps.socketRegistry, machine });
	await scheduleMachine(deps, { machineId: machine.id });

	return machine;
}
