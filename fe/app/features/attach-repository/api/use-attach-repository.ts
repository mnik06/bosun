import { notifications } from '@mantine/notifications'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { repositoryKeys } from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// A 202: the clone happens on the machine afterwards. Success arrives as the
// machine's row changing over the socket, and a failure as its own frame.
export function useAttachRepository (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (githubRepoId: number): Promise<void> => {
			await apiClient.post(`/machines/${machineId}/repository`, { githubRepoId })
		},
		onSuccess: async () => {
			notifications.show({
				color: 'blue',
				title: 'Cloning on the machine',
				message: 'The repository row turns green once the clone lands.'
			})
			await queryClient.invalidateQueries({ queryKey: repositoryKeys.list() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not attach the repository', error })
		}
	})
}
