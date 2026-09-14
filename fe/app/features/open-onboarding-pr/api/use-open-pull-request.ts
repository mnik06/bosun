import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { repositoryKeys } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const OpenedSchema = z.object({ prUrl: z.string() })

export function useOpenPullRequest (repositoryId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (): Promise<string> => {
			const { data } = await apiClient.post<unknown>(`/repositories/${repositoryId}/pull-request`)

			return OpenedSchema.parse(data).prUrl
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.list() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not open the pull request', error })
		}
	})
}
