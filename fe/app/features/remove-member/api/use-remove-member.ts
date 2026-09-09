import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys } from '~/entities/project'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useRemoveMember (projectId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (userId: string) => {
			await apiClient.delete(`/projects/${projectId}/members/${userId}`)
		},
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not remove member', error })
		}
	})
}
