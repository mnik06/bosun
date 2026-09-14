import { HttpError } from 'src/api/errors/HttpError';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { getMachine } from 'src/controllers/machines/get-machine';
import { announceRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type BuildRepo } from 'src/repos/builds/build.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type IdService } from 'src/services/ids/id.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';
import { toRepositorySlug, type Repository } from 'src/types/RepositorySchema';
import { compareVersions } from 'src/utils/general';

// The release that carries `repo.attach`, the credential helper, the toolchain and
// stack services and the key. An older agent would drop the frame as unknown, and
// the browser would wait on a clone that is never going to start.
export const MIN_REPOSITORY_AGENT_VERSION = '3.0.0';

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
			defaultBranch: remote.defaultBranch,
			slug: toRepositorySlug(remote.fullName)
		}
	});
}

async function refusal(opts: {
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
	if (machine.repositoryId !== null && (await opts.buildRepo.listForMachine({ machineId: machine.id, statuses: ['building', 'integrating', 'waiting_verify', 'driving', 'fixing', 'rechecking', 'in_review', 'held', 'waiting_answer'] })).length > 0) {
		return 'This machine still holds builds on its current clone — let them finish or cancel them before attaching another repository';
	}

	return null;
}

// The repository is named by its GitHub id and resolved against what the project's
// installations grant right now, so an id nobody granted cannot be attached by
// typing it. Picking it is what creates the repository's row: a second machine on
// the same repository finds that row, with its draft and its discovery.
//
// `repositoryId` is written before the frame goes out, not when the clone lands:
// the clone asks the credential route for a token, and that route answers only for
// the repository the machine is attached to.
export async function attachRepository(opts: {
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
	const refused = await refusal({ ...opts, machine });

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

	if (machine.repositoryId !== null && machine.repositoryId !== repository.id) {
		throw new HttpError(409, 'This machine is already attached to another repository — a machine works on one repository');
	}

	announceRepository({ socketRegistry: opts.socketRegistry, repository });

	const attached = await opts.machineRepo.setRepository({ id: machine.id, repositoryId: repository.id });
	const sent = await dispatchAttach({ ...opts, machineId: machine.id, repository }).catch(async (error: unknown) => {
		await opts.machineRepo.clearRepositoryIf({ id: machine.id, repositoryId: repository.id });

		throw error;
	});

	if (!sent) {
		await opts.machineRepo.clearRepositoryIf({ id: machine.id, repositoryId: repository.id });

		throw new HttpError(409, 'machine offline');
	}

	if (attached) {
		opts.socketRegistry.broadcastToUi({ projectId: opts.projectId, message: { type: 'machine.updated', machine: attached } });
	}
}
