import { notifications } from '@mantine/notifications'
import { useMutation } from '@tanstack/react-query'

import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// A 202: the clone happens on the machine afterwards. Success arrives as the
// machine's row changing over the socket, and a failure as its own frame.
export function useAttachRepository (machineId: string) {
	return useMutation({
		mutationFn: async (repositoryId: string): Promise<void> => {
			await apiClient.post(`/machines/${machineId}/repository`, { repositoryId })
		},
		onSuccess: () => {
			notifications.show({
				color: 'blue',
				title: 'Cloning on the machine',
				message: 'The git check turns green once the clone lands.'
			})
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not attach the repository', error })
		}
	})
}
