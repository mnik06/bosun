import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys } from '~/entities/project'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useRenameProject (projectId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (name: string) => {
			await apiClient.patch(`/projects/${projectId}`, { name })
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not rename project', error })
		}
	})
}
