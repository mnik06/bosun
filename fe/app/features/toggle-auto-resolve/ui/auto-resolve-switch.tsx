import { Switch } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { repositoryKeys, RepositorySchema, type Repository } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const UpdateRespSchema = z.object({ repository: RepositorySchema })

export function AutoResolveSwitch ({ repository }: { repository: Repository }) {
	const queryClient = useQueryClient()
	const toggle = useMutation({
		mutationFn: async (autoResolveConflicts: boolean) => {
			const { data } = await apiClient.patch<unknown>(`/repositories/${repository.id}`, { autoResolveConflicts })

			return UpdateRespSchema.parse(data).repository
		},
		onSuccess: (updated) => {
			queryClient.setQueryData<Repository[]>(repositoryKeys.list(), (previous) =>
				previous?.map((entry) => (entry.id === updated.id ? updated : entry))
			)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change conflict resolution', error })
		}
	})

	return (
		<Switch
			label="Resolve conflicts with a session"
			description="When two plans conflict outside generated files, a session resolves the merge with both plans' criteria in front of it, and the resolved diff goes in the pull request. Off, the plan stops on needs you instead."
			checked={toggle.isPending ? toggle.variables : repository.autoResolveConflicts}
			disabled={toggle.isPending}
			onChange={(event) => {
				toggle.mutate(event.currentTarget.checked)
			}}
		/>
	)
}
