import { useMutation } from '@tanstack/react-query'

import type { PlanAnswer } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

interface AnswerVars {
	questionId: string
	answers: PlanAnswer[]
}

async function answerQuestion (opts: { planId: string } & AnswerVars): Promise<void> {
	await apiClient.post(`/plans/${opts.planId}/answer`, {
		questionId: opts.questionId,
		answers: opts.answers
	})
}

export function useAnswerQuestion (planId: string) {
	return useMutation({
		mutationFn: async (vars: AnswerVars) => answerQuestion({ planId, ...vars }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not send your answer', error })
		}
	})
}
