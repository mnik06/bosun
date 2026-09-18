import { HttpError } from 'src/api/errors/HttpError';
import { listAvailableRepositories } from 'src/controllers/github/list-available-repositories';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { type GithubWebhookSyncDeps, ensureGithubWebhookOnAttach } from 'src/controllers/github/shared/webhook';
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

// AC-61, AC-62: called before `upsert` overwrites the row's connection columns,
// while the previous connection and its webhook id are still readable. A
// switch to the App, or to a *different* PAT connection, both leave the old
// webhook behind on GitHub's side, and — for a PAT-to-PAT switch specifically
// — leave its id/secret/syncMode stale on the row, since `upsert` itself only
// clears those columns for the App branch. Both are cleared here regardless
// of whether GitHub's own deletion succeeds: a webhook GitHub refuses to
// delete is its own orphan to clean up, but the *local* row must never keep
// claiming a webhook that either no longer exists or belongs to a connection
// this repository is leaving — `ensureGithubWebhookOnAttach`'s idempotency
// check would otherwise mistake it for the new connection's own webhook and
// skip creating one.
async function removeStaleGithubWebhook(opts: {
	repositoryRepo: RepositoryRepo;
	githubPatConnectionRepo: GithubPatConnectionRepo;
	githubPat: GithubPatService;
	patEncryption: PatEncryptionService;
	repository: Repository;
}): Promise<void> {
	if (opts.repository.githubPatConnectionId === null) {
		return;
	}

	const [webhookId, oldConnection] = await Promise.all([
		opts.repositoryRepo.getGithubWebhookIdById(opts.repository.id),
		opts.githubPatConnectionRepo.getById(opts.repository.githubPatConnectionId)
	]);

	if (webhookId === null) {
		return;
	}

	await opts.repositoryRepo.clearGithubWebhookState(opts.repository.id);

	const encryptedToken = oldConnection ? await opts.githubPatConnectionRepo.getEncryptedTokenById({ id: oldConnection.id, projectId: oldConnection.projectId }) : null;

	if (encryptedToken === null) {
		return;
	}

	await opts.githubPat.deleteWebhook({ pat: opts.patEncryption.decrypt(encryptedToken), fullName: opts.repository.fullName, webhookId });
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

	try {
		const token = await opts.githubApp.metadataToken({ installationId: installation.installationId, githubRepoId: opts.githubRepoId });

		return await opts.githubApp.getRepository({ token, githubRepoId: opts.githubRepoId });
	} catch (error) {
		throw toGithubHttpError(error);
	}
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
export async function attachGithubRepository(
	opts: GithubWebhookSyncDeps & {
		machineRepo: MachineRepo;
		githubInstallationRepo: GithubInstallationRepo;
		buildRepo: BuildRepo;
		githubApp: GithubAppService;
		id: string;
		projectId: string;
		githubRepoId: number;
	}
): Promise<void> {
	const machine = await getMachine({ machineRepo: opts.machineRepo, id: opts.id, projectId: opts.projectId });
	const refused = await attachRefusal({ ...opts, machine, provider: 'github' });

	if (refused !== null) {
		throw new HttpError(409, refused);
	}

	const granted = (await listAvailableRepositories(opts)).find((repo) => repo.githubRepoId === opts.githubRepoId);

	if (!granted) {
		throw new HttpError(404, 'No GitHub account connected to this project grants that repository');
	}

	const existing = await opts.repositoryRepo.getOwnedByGithubRepoId({ projectId: opts.projectId, githubRepoId: opts.githubRepoId });
	const newConnectionId = granted.connection.kind === 'pat' ? granted.connection.connectionId : null;

	if (existing && existing.githubPatConnectionId !== null && existing.githubPatConnectionId !== newConnectionId) {
		await removeStaleGithubWebhook({ ...opts, repository: existing });
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

	if (granted.connection.kind === 'pat') {
		const connection = await opts.githubPatConnectionRepo.getById(granted.connection.connectionId);
		const encryptedToken = connection ? await opts.githubPatConnectionRepo.getEncryptedTokenById({ id: connection.id, projectId: opts.projectId }) : null;

		if (connection && encryptedToken !== null) {
			await ensureGithubWebhookOnAttach(opts, { repository, connection, pat: opts.patEncryption.decrypt(encryptedToken) });
		}
	}

	await finishAttach({
		machineRepo: opts.machineRepo,
		socketRegistry: opts.socketRegistry,
		machine,
		repository,
		dispatch: () => dispatchAttach({ ...opts, machineId: machine.id, repository })
	});
}
