import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { GithubInstallationSchema, repositoryKeys, type GithubInstallation } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const InstallUrlSchema = z.object({ url: z.string(), authorizeUrl: z.string() })

const InstalledSchema = z.object({ installation: GithubInstallationSchema })

const ImportedSchema = z.array(GithubInstallationSchema)

export interface GithubAuthorization {
	code: string
	state: string
}

export interface GithubInstallCallback extends GithubAuthorization {
	installationId: number
}

// The URL carries a state the backend signed for this person and this project,
// so it is fetched on the click rather than built here.
//
// `import` skips the install page. GitHub answers that page, for an account the
// App is already installed on, with the installation's settings — and those never
// redirect back — so an existing installation is connected by authorizing alone.
export function useConnectGithub (mode: 'install' | 'import' = 'install') {
	return useMutation({
		mutationFn: async (): Promise<string> => {
			const { data } = await apiClient.get<unknown>('/github/install-url')
			const urls = InstallUrlSchema.parse(data)

			return mode === 'install' ? urls.url : urls.authorizeUrl
		},
		onSuccess: (url) => {
			window.location.assign(url)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start connecting GitHub', error })
		}
	})
}

export function useCompleteGithubInstall () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (callback: GithubInstallCallback): Promise<GithubInstallation> => {
			const { data } = await apiClient.post<unknown>('/github/installations', callback)

			return InstalledSchema.parse(data).installation
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.all() })
	})
}

export function useImportGithubInstallations () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (authorization: GithubAuthorization): Promise<GithubInstallation[]> => {
			const { data } = await apiClient.post<unknown>('/github/installations/import', authorization)

			return ImportedSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.all() })
	})
}
