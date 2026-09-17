import { assertUniqueKeys } from 'src/controllers/machines/shared/assert-unique-keys';
import { relayEnvFrame, type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { type EnvVarInput } from 'src/types/env-sets';
import { type Machine } from 'src/types/MachineSchema';

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
	assertUniqueKeys(opts.vars);

	return relayEnvFrame(deps, {
		id: opts.id,
		projectId: opts.projectId,
		onSaved: opts.onSaved,
		frame: { type: 'secrets.set', vars: opts.vars }
	});
}
