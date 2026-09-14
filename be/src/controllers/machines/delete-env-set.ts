import { relayEnvFrame, type EnvRelayDeps } from 'src/controllers/machines/shared/relay-env-frame';
import { type Machine } from 'src/types/MachineSchema';

export async function deleteEnvSet(
	deps: EnvRelayDeps,
	opts: { id: string; projectId: string; path: string }
): Promise<Machine> {
	return relayEnvFrame(deps, { ...opts, frame: { type: 'env.delete' } });
}
