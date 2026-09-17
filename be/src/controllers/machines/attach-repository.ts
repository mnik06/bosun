import { HttpError } from 'src/api/errors/HttpError';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { getMachine } from 'src/controllers/machines/get-machine';
import { attachRefusal } from 'src/controllers/machines/shared/attach-refusal';
import { finishAttach } from 'src/controllers/machines/shared/finish-attach';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type GithubPatConnectionRepo } from 'src/repos/github/github-pat-connection.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type PatEncryptionService } from 'src/services/crypto/pat-encryption.service';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type GithubPatService } from 'src/services/github/github-pat.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { toRepositorySlug, type Repository } from 'src/types/RepositorySchema';

// GitHub's own clone URL shape — deterministic from the full name alone, the
// same call `azureCloneUrl` makes for a PAT-connected Azure repository, and for
// the same reason: there is no App installation token to mint a fresh remote
// from, so there is nothing to gain by asking GitHub again for what the merged
// listing (`listAvailableRepositories`) already just confirmed.
function githubPatCloneUrl(fullName: string): string {
	return `https://github.com/${fullName}.git`;
}

async function remoteFor(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	installationId: string;
	githubRepoId: number;
}) {
	const installation = await opts.githubInstallationRepo.getById(opts.installationId);

	if (!installation) {
		throw new HttpError(409, 'The GitHub installation this repository came from is no longer connected');
	}

	return opts.githubApp
		.getRepository({ installationId: installation.installationId, githubRepoId: opts.githubRepoId })
		.catch((error: unknown) => {
			throw toGithubHttpError(error);
		});
}

export async function dispatchAttach(opts: {
	githubApp: GithubAppService;
	githubInstallationRepo: GithubInstallationRepo;
	socketRegistry: SocketRegistry;
	machineId: string;
	repository: Repository;
}): Promise<boolean> {
	if (opts.repository.githubRepoId === null) {
		throw new HttpError(409, 'This repository is not a GitHub repository');
	}

	// App-connected: re-asked of GitHub, the same defensive re-check the App path
	// has always made — an installation revoked or a repository renamed between
	// the upsert above and this dispatch is caught here rather than sending a
	// stale remote to the machine. PAT-connected: nothing to re-ask, since the
	// merged listing already confirmed the token can still push to it.
	if (opts.repository.installationId !== null) {
		const remote = await remoteFor({ ...opts, installationId: opts.repository.installationId, githubRepoId: opts.repository.githubRepoId });

		return opts.socketRegistry.sendToAgent({
			machineId: opts.machineId,
			message: {
				type: 'repo.attach',
				repositoryId: opts.repository.id,
				cloneUrl: remote.cloneUrl,
				defaultBranch: remote.defaultBranch,
				slug: toRepositorySlug(remote.fullName)
			}
		});
	}

	return opts.socketRegistry.sendToAgent({
		machineId: opts.machineId,
		message: {
			type: 'repo.attach',
			repositoryId: opts.repository.id,
			cloneUrl: githubPatCloneUrl(opts.repository.fullName),
			defaultBranch: opts.repository.defaultBranch,
			slug: toRepositorySlug(opts.repository.fullName)
		}
	});
}

// The repository is named by its GitHub id and resolved against what the
// project's installations and PAT connections grant right now (the merged
// `listAvailableRepositories`, App winning when both reach the same id), so an
// id nobody granted cannot be attached by typing it. Picking it is what creates
// the repository's row: a second machine on the same repository finds that row,
// with its draft and its discovery.
//
// `repositoryId` is written before the frame goes out, not when the clone lands:
// the clone asks the credential route for a token, and that route answers only for
// the repository the machine is attached to.
export async function attachGithubRepository(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	githubPatConnectionRepo: GithubPatConnectionRepo;
	buildRepo: BuildRepo;
	githubApp: GithubAppService;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	idService: IdService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	githubRepoId: number;
}): Promise<void> {
	const machine = await getMachine({ machineRepo: opts.machineRepo, id: opts.id, projectId: opts.projectId });
	const refused = await attachRefusal({ ...opts, machine, provider: 'github' });

	if (refused !== null) {
		throw new HttpError(409, refused);
	}

	const granted = (await listAvailableRepositories(opts)).find((repo) => repo.githubRepoId === opts.githubRepoId);

	if (!granted) {
		throw new HttpError(404, 'No GitHub account connected to this project grants that repository');
	}

	const base = {
		id: opts.idService.createRepositoryId(),
		projectId: opts.projectId,
		githubRepoId: granted.githubRepoId,
		fullName: granted.fullName,
		defaultBranch: granted.defaultBranch
	};
	const repository = await opts.repositoryRepo.upsert(
		granted.connection.kind === 'app' ? { ...base, installationId: granted.connection.installationId } : { ...base, githubPatConnectionId: granted.connection.connectionId }
	);

	await finishAttach({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machine,
		repository,
		dispatch: () => dispatchAttach({ ...opts, machineId: machine.id, repository })
	});
}
