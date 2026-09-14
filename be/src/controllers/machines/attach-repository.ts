import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { getMachine } from 'src/controllers/machines/get-machine';
import { getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type MachineRepo } from 'src/repos/machines/machine.repo';
import { type QueueRepo } from 'src/repos/queues/queue.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
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

// `repositoryId` is written before the frame goes out, not when the clone lands:
// the clone asks the credential route for a token, and that route answers only for
// the repository the machine is attached to.
export async function attachRepository(opts: {
	machineRepo: MachineRepo;
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	queueRepo: QueueRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	repositoryId: string;
}): Promise<void> {
	const [machine, repository] = await Promise.all([
		getMachine({ machineRepo: opts.machineRepo, id: opts.id, projectId: opts.projectId }),
		getOwnedRepository({ repositoryRepo: opts.repositoryRepo, id: opts.repositoryId, projectId: opts.projectId })
	]);

	if (machine.status !== 'online' || !opts.socketRegistry.getAgentSocket(machine.id)) {
		throw new HttpError(409, 'machine offline');
	}

	if (machine.agentVersion === null || compareVersions(machine.agentVersion, MIN_REPOSITORY_AGENT_VERSION) < 0) {
		throw new HttpError(409, `This machine's agent (${machine.agentVersion ?? 'unknown'}) is older than ${MIN_REPOSITORY_AGENT_VERSION} and cannot clone a repository — upgrade it with Refresh first`);
	}

	if (machine.repositoryId !== null && machine.repositoryId !== repository.id) {
		throw new HttpError(409, 'This machine is already attached to another repository — a machine works on one repository');
	}

	// A queue's worktree is a worktree of the checkout it was made from. Moving the
	// machine to a new clone underneath one would leave it pointing nowhere.
	if (machine.repositoryId === null && (await opts.queueRepo.listForMachine({ machineId: machine.id, projectId: opts.projectId })).length > 0) {
		throw new HttpError(409, 'This machine still has queues on its current checkout — remove them before attaching a repository');
	}

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
