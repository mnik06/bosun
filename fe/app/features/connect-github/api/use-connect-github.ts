import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { GithubInstallationSchema, repositoryKeys, type GithubInstallation } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const InstallUrlSchema = z.object({ url: z.string() })

const InstalledSchema = z.object({ installation: GithubInstallationSchema })

export interface GithubInstallCallback {
	installationId: number
	code: string
	state: string
}

// The URL carries a state the backend signed for this person and this project,
// so it is fetched on the click rather than built here.
export function useConnectGithub () {
	return useMutation({
		mutationFn: async (): Promise<string> => {
			const { data } = await apiClient.get<unknown>('/github/install-url')

			return InstallUrlSchema.parse(data).url
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
