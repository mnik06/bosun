import type { Repository } from '~/entities/repository/model/repository'

// `fullName` is `{org}/{project}/{repo}` for Azure (three segments, to avoid
// colliding with a same-named repository in another org or project) and
// `{owner}/{repo}` for GitHub — each provider's own host URL is built back out
// of it rather than stored separately.
export function repositoryHostUrl (repository: Repository): string {
	if (repository.provider === 'azure_devops') {
		const segments = repository.fullName.split('/').map(encodeURIComponent)

		return `https://dev.azure.com/${segments[0]}/${segments[1]}/_git/${segments[2]}`
	}

	return `https://github.com/${repository.fullName}`
}
