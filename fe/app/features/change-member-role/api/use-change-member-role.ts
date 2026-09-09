import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys, type ProjectRole } from '~/entities/project'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useChangeMemberRole (projectId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (opts: { userId: string, role: ProjectRole }) => {
			await apiClient.patch(`/projects/${projectId}/members/${opts.userId}`, {
				role: opts.role
			})
		},
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change role', error })
		}
	})
}
