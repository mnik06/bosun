import { assertUniqueKeys } from 'src/controllers/machines/shared/assert-unique-keys';
import { relayEnvFrame, type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';

export async function saveEnvSet(
	deps: EnvRelayDeps,
	opts: {
		id: string;
		projectId: string;
		path: string;
		vars: EnvVarInput[];
		onSaved?: (machine: Machine) => Promise<void>;
	}
): Promise<Machine> {
	assertUniqueKeys(opts.vars);

	return relayEnvFrame(deps, {
		id: opts.id,
		projectId: opts.projectId,
		onSaved: opts.onSaved,
		frame: { type: 'env.set', path: opts.path, vars: opts.vars }
	});
}
