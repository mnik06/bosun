import { HttpError } from 'src/api/errors/HttpError';
import { toAzureHttpError } from 'src/controllers/azure/shared/azure-errors';
import { getMachine } from 'src/controllers/machines/get-machine';
import { attachRefusal } from 'src/controllers/machines/shared/attach-refusal';
import { finishAttach } from 'src/controllers/machines/shared/finish-attach';
import { type AzureConnectionRepo } from 'src/repos/azure/azure-connection.repo';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type AzureDevOpsService } from 'src/services/azure/azure-devops.service';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { azureCloneUrl } from 'src/types/AzureSchema';
import { toRepositorySlug, type Repository } from 'src/types/RepositorySchema';

// Deterministic from the org, the project and the repository's own name — unlike
// GitHub's clone URL, nothing here needs a network round trip to Azure.
async function dispatchAzureAttach(opts: { socketRegistry: SocketRegistry; machineId: string; repository: Repository; organization: string; azureProjectName: string; repoName: string }): Promise<boolean> {
	return opts.socketRegistry.sendToAgent({
		machineId: opts.machineId,
		message: {
			type: 'repo.attach',
			repositoryId: opts.repository.id,
			cloneUrl: azureCloneUrl({ organization: opts.organization, projectName: opts.azureProjectName, repoName: opts.repoName }),
			defaultBranch: opts.repository.defaultBranch,
			slug: toRepositorySlug(opts.repository.fullName)
		}
	});
}

// Mirrors `attachGithubRepository`: the repository is named by organization +
// Azure project id + repository GUID and resolved against what the connection's
// PAT grants right now, so an id nobody's token can see cannot be attached by
// typing it (AC-29, AC-30). `attachRefusal` gates this on the agent version that
// first answers for `dev.azure.com`, so the clone dispatched below only ever
// reaches a machine that can actually authenticate it.
export async function attachAzureRepository(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	azureConnectionRepo: AzureConnectionRepo;
	buildRepo: BuildRepo;
	azureDevOps: AzureDevOpsService;
	patEncryption: PatEncryptionService;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	azureConnectionId: string;
	azureProjectId: string;
	azureRepoId: string;
}): Promise<void> {
	const machine = await getMachine({ machineRepo: opts.machineRepo, id: opts.id, projectId: opts.projectId });
	const refused = await attachRefusal({ ...opts, machine, provider: 'azure_devops' });

	if (refused !== null) {
		throw new HttpError(409, refused);
	}

	const connection = await opts.azureConnectionRepo.getOwnedById({ id: opts.azureConnectionId, projectId: opts.projectId });

	if (!connection) {
		throw new HttpError(404, 'No Azure DevOps organization connected to this project matches that connection');
	}

	if (connection.status === 'broken') {
		throw new HttpError(409, "This organization's token is broken — replace it in Settings before attaching a repository");
	}

	const encryptedPat = await opts.azureConnectionRepo.getEncryptedPatById({ id: connection.id, projectId: opts.projectId });

	if (encryptedPat === null) {
		throw new HttpError(404, 'No Azure DevOps organization connected to this project matches that connection');
	}

	const pat = opts.patEncryption.decrypt(encryptedPat);
	const available = await opts.azureDevOps.listRepositories({ organization: connection.organization, pat }).catch((error: unknown) => {
		throw toAzureHttpError(error);
	});
	const granted = available.find((repo) => repo.azureProjectId === opts.azureProjectId && repo.azureRepoId === opts.azureRepoId);

	if (!granted) {
		throw new HttpError(404, "That repository is not visible to this organization's token");
	}

	const repository = await opts.repositoryRepo.upsertAzure({
		id: opts.idService.createRepositoryId(),
		projectId: opts.projectId,
		azureConnectionId: connection.id,
		azureProjectId: granted.azureProjectId,
		azureRepoId: granted.azureRepoId,
		fullName: granted.fullName,
		defaultBranch: granted.defaultBranch
	});

	const repoName = granted.fullName.split('/').at(-1) ?? granted.fullName;

	await finishAttach({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machine,
		repository,
		dispatch: () =>
			dispatchAzureAttach({
				socketRegistry: opts.socketRegistry,
				machineId: machine.id,
				repository,
				organization: connection.organization,
				azureProjectName: granted.azureProjectName,
				repoName
			})
	});
}
