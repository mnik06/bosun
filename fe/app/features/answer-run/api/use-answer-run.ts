import { useMutation, useQueryClient } from '@tanstack/react-query'

import { refreshAfterBuild, type PlanAnswer } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export interface RunAnswer {
	questionId: string
	answers: PlanAnswer[]
}

export function useAnswerRun (opts: { runId: string, planId: string }) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (payload: RunAnswer) => {
			await apiClient.post(`/runs/${opts.runId}/answer`, payload)
		},
		onSuccess: () => {
			refreshAfterBuild({ queryClient, planId: opts.planId })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not send the answer', error })
		}
	})
}
