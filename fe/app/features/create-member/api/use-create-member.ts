import { useMutation, useQueryClient } from '@tanstack/react-query'

import { CreatedMemberSchema, projectKeys, type CreatedMember } from '~/entities/project'
import type { CreateMemberForm } from '~/features/create-member/model/create-member'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useCreateMember (projectId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (form: CreateMemberForm): Promise<CreatedMember> => {
			const { data } = await apiClient.post<unknown>(`/projects/${projectId}/members`, form)

			return CreatedMemberSchema.parse(data)
		},
		onSuccess: async () =>
			queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not add member', error })
		}
	})
}
