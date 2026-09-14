import type { Repository } from '~/entities/repository/model/repository'

export type ConfigSource = 'file' | 'draft' | 'none'

// The file wins whenever it exists: a session uses the tree's own config and
// only falls back to the draft when the branch has none.
export function configSource (repository: Pick<Repository, 'configOnDefault' | 'configDraft'>): ConfigSource {
	if (repository.configOnDefault) {
		return 'file'
	}

	return repository.configDraft === null ? 'none' : 'draft'
}

export function describeConfigSource (repository: Repository): string {
	switch (configSource(repository)) {
		case 'file':
			return `from .bosun/project.yaml on ${repository.defaultBranch}`
		case 'draft':
			return 'bosun draft — no .bosun/project.yaml on the default branch yet'
		case 'none':
			return 'none yet'
	}
}
