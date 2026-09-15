import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys } from '~/entities/project'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useDeleteProject (projectId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			await apiClient.delete(`/projects/${projectId}`)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not delete project', error })
		}
	})
}
