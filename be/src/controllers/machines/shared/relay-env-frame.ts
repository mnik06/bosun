import { HttpError } from 'src/api/errors/HttpError';
import { getMachine } from 'src/controllers/machines/get-machine';
import { announceMachine } from 'src/controllers/machines/shared/announce';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type IdService } from 'src/services/ids/id.service';
import { type PendingEnvRequestsService } from 'src/services/sockets/pending-env-requests.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';
import { normalizeEnvPath } from 'src/utils/env-path';
import { orNotFound } from 'src/utils/general';

const REPLY_TIMEOUT_MS = 15_000;

export const KEYLESS_AGENT =
	"This machine's agent is too old to receive values from the browser — upgrade it with Refresh";

export type EnvRelayDeps = {
	machineRepo: MachineRepo;
	socketRegistry: SocketRegistry;
	idService: IdService;
	pendingEnvRequests: PendingEnvRequestsService;
};

type EnvFrame =
	| { type: 'env.set'; path: string; vars: EnvVarInput[] }
	| { type: 'env.delete'; path: string }
	| { type: 'secrets.set'; vars: EnvVarInput[] };

function withNormalizedPath(frame: EnvFrame): EnvFrame {
	if (frame.type === 'secrets.set') {
		return frame;
	}

	const path = normalizeEnvPath(frame.path);

	if (path === null) {
		throw new HttpError(400, 'invalid path');
	}

	return { ...frame, path };
}

// Only sealed values travel, and only to a machine that published the key they
// were sealed to: a keyless agent is refused outright rather than sent a value it
// could only have received in the clear. The values ride the frame and nothing
// else — the key names the machine answers with are all this database keeps.
export async function relayEnvFrame(
	deps: EnvRelayDeps,
	opts: { id: string; projectId: string; frame: EnvFrame; onSaved?: (machine: Machine) => Promise<void> }
): Promise<Machine> {
	const target = await getMachine({ machineRepo: deps.machineRepo, id: opts.id, projectId: opts.projectId });

	if (opts.frame.type !== 'env.delete' && target.publicKey === null) {
		throw new HttpError(409, KEYLESS_AGENT);
	}

	const frame = withNormalizedPath(opts.frame);
	const requestId = deps.idService.createCommandId();
	const reply = deps.pendingEnvRequests.wait({ requestId, machineId: target.id, timeoutMs: REPLY_TIMEOUT_MS });
	const sent = deps.socketRegistry.sendToAgent({ machineId: target.id, message: { ...frame, requestId } });

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

	const saved = await deps.machineRepo.saveEnvSets({ id: target.id, envSets: result.envSets });
	const machine = await orNotFound(
		result.sessionSecrets === undefined
			? Promise.resolve(saved)
			: deps.machineRepo.saveSessionSecrets({ id: target.id, sessionSecrets: result.sessionSecrets }),
		'Machine not found'
	);

	announceMachine({ socketRegistry: deps.socketRegistry, machine });

	await opts.onSaved?.(machine);

	return machine;
}
