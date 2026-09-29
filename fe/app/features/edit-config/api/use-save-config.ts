import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { RepositorySchema, repositoryKeys, type Repository } from '~/entities/repository'
import { configIssues } from '~/features/edit-config/lib/config-issues'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const SavedSchema = z.object({ repository: RepositorySchema })

export function useSaveConfig (repositoryId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (text: string): Promise<Repository> => {
			const { data } = await apiClient.put<unknown>(`/repositories/${repositoryId}/config`, { text })

			return SavedSchema.parse(data).repository
		},
		onSuccess: async () => {
			notifications.show({ color: 'green', title: 'Config saved', message: 'It validated.' })
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: repositoryKeys.list() }),
				queryClient.invalidateQueries({ queryKey: repositoryKeys.config(repositoryId) })
			])
		},
		onError: (error: unknown) => {
			// Issues render beside the editor; only a failure without them is a toast.
			if (configIssues(error) === null) {
				notifyError({ title: 'Could not save the config', error })
			}
		}
	})
}
