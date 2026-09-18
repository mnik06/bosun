import { dispatchAttach } from 'src/controllers/machines/attach-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { type Machine } from 'src/types/MachineSchema';

// The row names a repository the agent says it does not have. The reply to an
// attach is lost when the clone outlives its socket — a deploy, an upgrade, a
// dropped connection — and nothing else would ever ask again: the checklist reads
// the row as attached while every session on the box fails for want of a clone.
// Asking again is safe because the agent answers a repeat with the attach it is
// already running. An agent too old to report a repository reports nothing, and
// is left alone.
export async function reconcileRepository(opts: {
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
	machine: Machine;
	reportedRepositoryId: string | null | undefined;
}): Promise<void> {
	if (opts.reportedRepositoryId !== null || opts.machine.repositoryId === null) {
		return;
	}

	const repository = await opts.repositoryRepo.getById(opts.machine.repositoryId);

	// Azure repositories do not clone yet (no credential helper support), so there
	// is nothing this reconnect-safety resend should do for one until that lands.
	if (!repository || repository.provider !== 'github') {
		return;
	}

	try {
		await dispatchAttach({ ...opts, machineId: opts.machine.id, repository });
	} catch {
		// GitHub unreachable or the installation gone: the next announce asks again,
		// and the leader sees the machine still waiting on its clone meanwhile.
	}
}
