import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { RepositorySchema, repositoryKeys, type Repository } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const AddedSchema = z.object({ repository: RepositorySchema })

export function useAddRepository () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (githubRepoId: number): Promise<Repository> => {
			const { data } = await apiClient.post<unknown>('/repositories', { githubRepoId })

			return AddedSchema.parse(data).repository
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.list() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not add the repository', error })
		}
	})
}
