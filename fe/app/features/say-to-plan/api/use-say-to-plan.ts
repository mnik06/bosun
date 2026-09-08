import { useMutation } from '@tanstack/react-query'

import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// Nothing is invalidated on success: what the session makes of the message
// arrives over the socket, and the message itself is echoed back the same way.
export function useSayToPlan (planId: string) {
	return useMutation({
		mutationFn: async (text: string) => {
			await apiClient.post(`/plans/${planId}/messages`, { text })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not send that', error })
		}
	})
}
