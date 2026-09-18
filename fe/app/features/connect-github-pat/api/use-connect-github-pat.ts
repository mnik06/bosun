import { useMutation, useQueryClient } from '@tanstack/react-query'

import { GithubPatConnectionSchema, repositoryKeys, type GithubPatConnection } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// Errors are left on the mutation rather than toasted: the modal renders the
// specific rejection inline (one of the six distinct messages) and keeps what
// was typed, which a toast that disappears in a few seconds cannot do.
export function useConnectGithubPatConnection () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (pat: string): Promise<GithubPatConnection> => {
			const { data } = await apiClient.post<unknown>('/github/pat-connections', { pat })

			return GithubPatConnectionSchema.parse(data)
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.patConnections() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.available() })
			])
		}
	})
}

export function useRotateGithubPatConnection (id: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (pat: string): Promise<GithubPatConnection> => {
			const { data } = await apiClient.put<unknown>(`/github/pat-connections/${id}`, { pat })

			return GithubPatConnectionSchema.parse(data)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.patConnections() })
	})
}

export function useDisconnectGithubPatConnection () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string): Promise<void> => {
			await apiClient.delete(`/github/pat-connections/${id}`)
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.patConnections() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.available() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.list() })
			])
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not disconnect the token', error })
		}
	})
}
