import { HttpError } from 'src/api/errors/HttpError';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { getMachine } from 'src/controllers/machines/get-machine';
import { attachRefusal } from 'src/controllers/machines/shared/attach-refusal';
import { finishAttach } from 'src/controllers/machines/shared/finish-attach';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { toRepositorySlug, type Repository } from 'src/types/RepositorySchema';

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
	if (opts.repository.installationId === null || opts.repository.githubRepoId === null) {
		throw new HttpError(409, 'This repository is not a GitHub repository');
	}

	const remote = await remoteFor({
		...opts,
		installationId: opts.repository.installationId,
		githubRepoId: opts.repository.githubRepoId
	});

	return opts.socketRegistry.sendToAgent({
		machineId: opts.machineId,
		message: {
			type: 'repo.attach',
			repositoryId: opts.repository.id,
			cloneUrl: remote.cloneUrl,
			defaultBranch: opts.repository.defaultBranchOverride ?? remote.defaultBranch,
			slug: toRepositorySlug(remote.fullName)
		}
	});
}

// The repository is named by its GitHub id and resolved against what the project's
// installations grant right now, so an id nobody granted cannot be attached by
// typing it. Picking it is what creates the repository's row: a second machine on
// the same repository finds that row, with its draft and its discovery.
//
// `repositoryId` is written before the frame goes out, not when the clone lands:
// the clone asks the credential route for a token, and that route answers only for
// the repository the machine is attached to.
export async function attachGithubRepository(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	buildRepo: BuildRepo;
	githubApp: GithubAppService;
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

	const repository = await opts.repositoryRepo.upsert({
		id: opts.idService.createRepositoryId(),
		projectId: opts.projectId,
		installationId: granted.installationId,
		githubRepoId: granted.githubRepoId,
		fullName: granted.fullName,
		defaultBranch: granted.defaultBranch
	});

	await finishAttach({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machine,
		repository,
		dispatch: () => dispatchAttach({ ...opts, machineId: machine.id, repository })
	});
}
