import { HttpError } from 'src/api/errors/HttpError';
import { relayEnvFrame, type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';
import { findDuplicate } from 'src/utils/general';

// Values a session gets in its environment and never in a file — test-account
// passwords, above all. The machine keeps them beside its env sets under the
// same rules: names come back, values never do.
export async function saveSessionSecrets(
	deps: EnvRelayDeps,
	opts: {
		id: string;
		projectId: string;
		vars: EnvVarInput[];
		onSaved?: (machine: Machine) => Promise<void>;
	}
): Promise<Machine> {
	const duplicate = findDuplicate(opts.vars.map((envVar) => envVar.key));

	if (duplicate !== null) {
		throw new HttpError(400, `duplicate key ${duplicate}`);
	}

	return relayEnvFrame(deps, {
		id: opts.id,
		projectId: opts.projectId,
		onSaved: opts.onSaved,
		frame: { type: 'secrets.set', vars: opts.vars }
	});
}
