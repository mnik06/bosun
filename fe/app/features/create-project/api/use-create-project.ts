import { useMutation, useQueryClient } from '@tanstack/react-query'

import { projectKeys } from '~/entities/project'
import type { CreateProjectForm } from '~/features/create-project/model/create-project'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useCreateProject () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (form: CreateProjectForm) => {
			await apiClient.post('/projects', form)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not create project', error })
		}
	})
}
