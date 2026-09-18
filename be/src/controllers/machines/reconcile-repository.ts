import { dispatchAzureAttach } from 'src/controllers/machines/attach-azure-repository';
import { dispatchAttach } from 'src/controllers/machines/attach-repository';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { azureRepositoryNames } from 'src/types/AzureSchema';
import { type Machine } from 'src/types/MachineSchema';
import { type Repository } from 'src/types/RepositorySchema';

type ReconcileDeps = {
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	azureConnectionRepo: AzureConnectionRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
};

// A broken token is left alone: its clone would fail at the credential helper,
// and the `repo.error` that follows detaches the machine from the repository.
async function dispatchAzure(opts: ReconcileDeps & { machineId: string; repository: Repository }): Promise<void> {
	const connection = opts.repository.azureConnectionId === null ? null : await opts.azureConnectionRepo.getById(opts.repository.azureConnectionId);
	const names = azureRepositoryNames(opts.repository.fullName);

	if (!connection || connection.status === 'broken' || !names) {
		return;
	}

	await dispatchAzureAttach({
		socketRegistry: opts.socketRegistry,
		machineId: opts.machineId,
		repository: opts.repository,
		organization: connection.organization,
		azureProjectName: names.projectName,
		repoName: names.repoName
	});
}

// The row names a repository the agent says it does not have. The reply to an
// attach is lost when the clone outlives its socket — a deploy, an upgrade, a
// dropped connection — and nothing else would ever ask again: the checklist reads
// the row as attached while every session on the box fails for want of a clone.
// Asking again is safe because the agent answers a repeat with the attach it is
// already running. An agent too old to report a repository reports nothing, and
// is left alone.
export async function reconcileRepository(
	opts: ReconcileDeps & {
		machine: Machine;
		reportedRepositoryId: string | null | undefined;
	}
): Promise<void> {
	if (opts.reportedRepositoryId !== null || opts.machine.repositoryId === null) {
		return;
	}

	const repository = await opts.repositoryRepo.getById(opts.machine.repositoryId);

	if (!repository) {
		return;
	}

	try {
		await (repository.provider === 'github'
			? dispatchAttach({ ...opts, machineId: opts.machine.id, repository })
			: dispatchAzure({ ...opts, machineId: opts.machine.id, repository }));
	} catch {
		// The provider unreachable or its connection gone: the next announce asks
		// again, and the leader sees the machine still waiting on its clone meanwhile.
	}
}
