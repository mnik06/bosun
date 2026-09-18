import { HttpError } from 'src/api/errors/HttpError';
import { announceRepository, getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { describeIssues, parseProjectConfig } from 'src/types/ProjectConfigSchema';
import { type Repository } from 'src/types/RepositorySchema';
import { orNotFound } from 'src/utils/general';

// Validated on write, so a draft that reaches a machine is one its schema accepts
// and a session never discovers the typo an hour into a bullet.
export async function saveConfigDraft(opts: {
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
	yaml: string;
}): Promise<Repository> {
	await getOwnedRepository(opts);

	const parsed = parseProjectConfig(opts.yaml);

	if (!parsed.ok) {
		throw new HttpError(400, `The config is not valid: ${describeIssues(parsed.issues)}`, {
			details: { issues: parsed.issues }
		});
	}

	const repository = await orNotFound(
		opts.repositoryRepo.saveConfigDraft({ id: opts.id, configDraft: opts.yaml }),
		'Repository not found'
	);

	announceRepository({ socketRegistry: opts.socketRegistry, repository });

	return repository;
}
