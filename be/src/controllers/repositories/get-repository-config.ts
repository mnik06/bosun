import { HttpError } from 'src/api/errors/HttpError';
import { toGithubHttpError } from 'src/controllers/github/shared/github-errors';
import { announceRepository, getOwnedRepository } from 'src/controllers/repositories/shared/announce-repository';
import { type GithubInstallationRepo } from 'src/repos/github/github-installation.repo';
import { type RepositoryRepo } from 'src/repos/github/repository.repo';
import { type GithubAppService } from 'src/services/github/github-app.service';
import { type SocketRegistry } from 'src/services/sockets/registry.service';
import { PROJECT_CONFIG_PATH } from 'src/types/ProjectConfigSchema';

export interface RepositoryConfig {
	defaultBranch: string;
	file: string | null;
	draft: string | null;
	source: 'file' | 'draft' | 'none';
}

// The file is read from GitHub each time rather than kept: it changes on merges
// bosun never hears about, and a copy would be a second, staler answer to what
// every session on the default branch is running. What it finds also corrects
// `config_on_default`, which otherwise only moves when an agent next announces.
export async function getRepositoryConfig(opts: {
	repositoryRepo: RepositoryRepo;
	githubInstallationRepo: GithubInstallationRepo;
	githubApp: GithubAppService;
	socketRegistry: SocketRegistry;
	id: string;
	projectId: string;
}): Promise<RepositoryConfig> {
	const repository = await getOwnedRepository(opts);
	const installation = repository.installationId === null ? null : await opts.githubInstallationRepo.getById(repository.installationId);

	if (!installation) {
		throw new HttpError(409, 'The GitHub installation this repository came from is no longer connected');
	}

	const file = await opts.githubApp
		.readFile({
			installationId: installation.installationId,
			// `installation` resolving means this repository is a GitHub one, so its
			// `githubRepoId` — set alongside `installationId` by `repositoryRepo.upsert` —
			// is set too.
			githubRepoId: repository.githubRepoId!,
			path: PROJECT_CONFIG_PATH,
			ref: repository.defaultBranch
		})
		.catch((error: unknown) => {
			throw toGithubHttpError(error);
		});

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
