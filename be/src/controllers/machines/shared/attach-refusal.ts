import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { compareVersions } from 'src/utils/general';

// The release that carries `repo.attach`, the credential helper, the toolchain and
// stack services and the key. An older agent would drop the frame as unknown, and
// the browser would wait on a clone that is never going to start.
export const MIN_REPOSITORY_AGENT_VERSION = '3.0.0';

// Provider-agnostic: nothing here differs between a GitHub and an Azure DevOps
// attach, so both `attachGithubRepository` and `attachAzureRepository` share it.
export async function attachRefusal(opts: {
	buildRepo: BuildRepo;
	socketRegistry: SocketRegistry;
	machine: Machine;
	projectId: string;
}): Promise<string | null> {
	const { machine } = opts;

	if (machine.status !== 'online' || !opts.socketRegistry.getAgentSocket(machine.id)) {
		return 'machine offline';
	}

	if (machine.agentVersion === null || compareVersions(machine.agentVersion, MIN_REPOSITORY_AGENT_VERSION) < 0) {
		return `This machine's agent (${machine.agentVersion ?? 'unknown'}) is older than ${MIN_REPOSITORY_AGENT_VERSION} and cannot clone a repository — upgrade it with Refresh first`;
	}

	// A build's worktree is a worktree of the clone it was made from. Moving the
	// machine to another clone underneath one would leave it pointing nowhere.
	if (
		machine.repositoryId !== null &&
		(
			await opts.buildRepo.listForMachine({
				machineId: machine.id,
				statuses: ['building', 'integrating', 'waiting_verify', 'driving', 'fixing', 'rechecking', 'in_review', 'held', 'waiting_answer']
			})
		).length > 0
	) {
		return 'This machine still holds builds on its current clone — let them finish or cancel them before attaching another repository';
	}

	return null;
}
