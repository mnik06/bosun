import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { RepositorySchema, repositoryKeys, type Repository } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const SavedSchema = z.object({ repository: RepositorySchema })

// Null goes back to the provider's default branch. A verify waiting on this
// choice starts on the backend, so the onboarding runs are read again too.
export function useSaveBaseBranch (repositoryId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (branch: string | null): Promise<Repository> => {
			const { data } = await apiClient.put<unknown>(`/repositories/${repositoryId}/default-branch`, { branch })

			return SavedSchema.parse(data).repository
		},
		onSuccess: async (updated) => {
			queryClient.setQueryData<Repository[]>(repositoryKeys.list(), (previous) =>
				previous?.map((entry) => (entry.id === updated.id ? updated : entry))
			)
			await queryClient.invalidateQueries({ queryKey: repositoryKeys.onboarding() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the base branch', error })
		}
	})
}
