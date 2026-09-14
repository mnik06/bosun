import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { RepositorySchema, repositoryKeys, type Repository } from '~/entities/repository'
import { configIssues } from '~/features/edit-config-draft/lib/config-issues'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const SavedSchema = z.object({ repository: RepositorySchema })

export function useSaveConfigDraft (repositoryId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (yaml: string): Promise<Repository> => {
			const { data } = await apiClient.put<unknown>(`/repositories/${repositoryId}/config-draft`, { yaml })

			return SavedSchema.parse(data).repository
		},
		onSuccess: async () => {
			notifications.show({ color: 'green', title: 'Draft saved', message: 'It validated.' })
			await queryClient.invalidateQueries({ queryKey: repositoryKeys.list() })
		},
		onError: (error: unknown) => {
			// Issues render beside the editor; only a failure without them is a toast.
			if (configIssues(error) === null) {
				notifyError({ title: 'Could not save the draft', error })
			}
		}
	})
}
