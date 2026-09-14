import { HttpError } from 'src/api/errors/HttpError';
import { getMachine } from 'src/controllers/machines/get-machine';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type PendingEnvRequestsService } from 'src/services/sockets/pending-env-requests.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';
import { normalizeEnvPath } from 'src/utils/env-path';

const REPLY_TIMEOUT_MS = 15_000;

export type EnvRelayDeps = {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	idService: IdService;
	pendingEnvRequests: PendingEnvRequestsService;
};

type EnvFrame = { type: 'env.set'; vars: EnvVarInput[] } | { type: 'env.delete' };

// The values travel on the frame and nowhere else: only the key list the machine
// answers with is written, which is what keeps them out of this database.
export async function relayEnvFrame(
	deps: EnvRelayDeps,
	opts: { id: string; projectId: string; path: string; frame: EnvFrame }
): Promise<Machine> {
	const { id: machineId } = await getMachine({
		machineRepo: deps.machineRepo,
		id: opts.id,
		projectId: opts.projectId
	});
	const path = normalizeEnvPath(opts.path);

	if (path === null) {
		throw new HttpError(400, 'invalid path');
	}

	const requestId = deps.idService.createCommandId();
	const reply = deps.pendingEnvRequests.wait({
		requestId,
		machineId,
		timeoutMs: REPLY_TIMEOUT_MS
	});
	const sent = deps.socketRegistry.sendToAgent({
		machineId,
		message: { ...opts.frame, path, requestId }
	});

	if (!sent) {
		deps.pendingEnvRequests.cancel(requestId);

		throw new HttpError(409, 'machine offline');
	}

	const result = await reply;

	if (!result) {
		throw new HttpError(504, 'the machine did not answer');
	}

	if (!result.ok) {
		throw new HttpError(422, result.message);
	}

	const machine = await deps.machineRepo.saveEnvSets({ id: machineId, envSets: result.envSets });

	if (!machine) {
		throw new HttpError(404, 'Machine not found');
	}

	deps.socketRegistry.broadcastToUi({
		projectId: machine.projectId,
		message: { type: 'machine.updated', machine }
	});

	return machine;
}
