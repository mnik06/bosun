import { HttpError } from 'src/api/errors/HttpError';
import { relayEnvFrame, type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';
import { findDuplicate } from 'src/utils/general';

export async function saveEnvSet(
	deps: EnvRelayDeps,
	opts: { id: string; projectId: string; path: string; vars: EnvVarInput[] }
): Promise<Machine> {
	const duplicate = findDuplicate(opts.vars.map((envVar) => envVar.key));

	if (duplicate !== null) {
		throw new HttpError(400, `duplicate key ${duplicate}`);
	}

	return relayEnvFrame(deps, {
		id: opts.id,
		projectId: opts.projectId,
		path: opts.path,
		frame: { type: 'env.set', vars: opts.vars }
	});
}
