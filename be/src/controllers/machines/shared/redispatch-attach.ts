import { dispatchAzureAttach } from 'src/controllers/machines/attach-azure-repository';
import { dispatchAttach } from 'src/controllers/machines/attach-repository';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { azureRepositoryNames } from 'src/types/AzureSchema';
import { type Repository } from 'src/types/RepositorySchema';

export type RedispatchAttachDeps = {
	githubInstallationRepo: GithubInstallationRepo;
	azureConnectionRepo: AzureConnectionRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
};

// A broken token is left alone: its clone would fail at the credential helper,
// and the `repo.error` that follows detaches the machine from the repository.
async function dispatchAzure(deps: RedispatchAttachDeps, opts: { machineId: string; repository: Repository }): Promise<void> {
	const connection = opts.repository.azureConnectionId === null ? null : await deps.azureConnectionRepo.getById(opts.repository.azureConnectionId);
	const names = azureRepositoryNames(opts.repository.fullName);

	if (!connection || connection.status === 'broken' || !names) {
		return;
	}

	await dispatchAzureAttach({
		socketRegistry: deps.socketRegistry,
		machineId: opts.machineId,
		repository: opts.repository,
		organization: connection.organization,
		azureProjectName: names.projectName,
		repoName: names.repoName
	});
}

// Asks the agent for an attach it already holds, or is still running. The agent
// answers a repeat by fetching and re-pointing `origin/HEAD` at the branch named
// rather than cloning again, so this is how a reconnect recovers a lost reply and
// how a changed default branch reaches every clone.
export async function redispatchAttach(deps: RedispatchAttachDeps, opts: { machineId: string; repository: Repository }): Promise<void> {
	try {
		await (opts.repository.provider === 'github'
			? dispatchAttach({ ...deps, machineId: opts.machineId, repository: opts.repository })
			: dispatchAzure(deps, opts));
	} catch {
		// The provider unreachable or its connection gone: the next announce asks
		// again, and the leader sees the machine still waiting on its clone meanwhile.
	}
}
