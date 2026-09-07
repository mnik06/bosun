import { useMutation, useQueryClient } from '@tanstack/react-query'

import { queueKeys } from '~/entities/queue'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export interface RunAnswer {
	questionId: string
	answers: { selected: string[] }[]
}

export function useAnswerRun (runId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (payload: RunAnswer) => {
			await apiClient.post(`/queues/runs/${runId}/answer`, payload)
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: queueKeys.all }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not send the answer', error })
		}
	})
}
