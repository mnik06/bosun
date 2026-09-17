import { toGitProviderHttpError } from 'src/controllers/line/shared/git-provider-error';
import { announceRepository, getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type GitProvider } from 'src/services/git/git-provider';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { PROJECT_CONFIG_PATH } from 'src/types/ProjectConfigSchema';
import { type Repository } from 'src/types/RepositorySchema';

export interface RepositoryConfig {
	defaultBranch: string;
	file: string | null;
	draft: string | null;
	source: 'file' | 'draft' | 'none';
}

// The file is read from the provider each time rather than kept: it changes on
// merges bosun never hears about, and a copy would be a second, staler answer to
// what every session on the default branch is running. What it finds also
// corrects `config_on_default`, which otherwise only moves when an agent next
// announces.
export async function getRepositoryConfig(opts: {
	repositoryRepo: RepositoryRepo;
	socketRegistry: SocketRegistry;
	gitProviderFor: (repository: Repository) => Promise<GitProvider>;
	id: string;
	projectId: string;
}): Promise<RepositoryConfig> {
	const repository = await getOwnedRepository(opts);
	let file: string | null;

	try {
		const provider = await opts.gitProviderFor(repository);

		file = await provider.readFile({ path: PROJECT_CONFIG_PATH, ref: repository.defaultBranch });
	} catch (error) {
		throw toGitProviderHttpError(error);
	}

	if ((file !== null) !== repository.configOnDefault) {
		const updated = await opts.repositoryRepo.saveConfigOnDefault({ id: repository.id, configOnDefault: file !== null });

		if (updated) {
			announceRepository({ socketRegistry: opts.socketRegistry, repository: updated });
		}
	}

	return {
		defaultBranch: repository.defaultBranch,
		file,
		draft: repository.configDraft,
		source: sourceOf({ file, draft: repository.configDraft })
	};
}

// The same rule sessions follow: the file whenever it exists, the draft only
// without one.
function sourceOf(opts: { file: string | null; draft: string | null }): RepositoryConfig['source'] {
	if (opts.file !== null) {
		return 'file';
	}

	return opts.draft === null ? 'none' : 'draft';
}
