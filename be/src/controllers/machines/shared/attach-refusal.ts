import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { type RepositoryProvider } from 'src/types/RepositorySchema';
import { compareVersions } from 'src/utils/general';

// The release that carries `repo.attach`, the credential helper, the toolchain and
// stack services and the key. An older agent would drop the frame as unknown, and
// the browser would wait on a clone that is never going to start.
export const MIN_REPOSITORY_AGENT_VERSION = '3.0.0';

// The release whose credential helper and workspace config first answer for
// `dev.azure.com` (AC-35, AC-36). An agent between the two minimums clones a
// GitHub repository fine but would silently fail to authenticate against Azure.
export const MIN_AZURE_REPOSITORY_AGENT_VERSION = '4.0.2';

// Shared by both `attachGithubRepository` and `attachAzureRepository`; only the
// version floor differs between the two providers.
export async function attachRefusal(opts: {
	buildRepo: BuildRepo;
	socketRegistry: SocketRegistry;
	machine: Machine;
	projectId: string;
	provider: RepositoryProvider;
}): Promise<string | null> {
	const { machine } = opts;

	if (machine.status !== 'online' || !opts.socketRegistry.getAgentSocket(machine.id)) {
		return 'machine offline';
	}

	const minVersion = opts.provider === 'azure_devops' ? MIN_AZURE_REPOSITORY_AGENT_VERSION : MIN_REPOSITORY_AGENT_VERSION;

	if (machine.agentVersion === null || compareVersions(machine.agentVersion, minVersion) < 0) {
		const kind = opts.provider === 'azure_devops' ? 'an Azure DevOps' : 'a GitHub';

		return `This machine's agent (${machine.agentVersion ?? 'unknown'}) is older than ${minVersion} and cannot clone ${kind} repository — upgrade it with Refresh first`;
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
