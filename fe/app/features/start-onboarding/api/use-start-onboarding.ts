import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import {
	OnboardingRunSchema,
	repositoryKeys,
	type OnboardingPhase,
	type OnboardingRun
} from '~/entities/repository'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const StartedSchema = z.object({ run: OnboardingRunSchema })

export function useStartOnboarding (machineId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (phase: OnboardingPhase): Promise<OnboardingRun> => {
			const { data } = await apiClient.post<unknown>(`/machines/${machineId}/onboarding`, { phase })

			return StartedSchema.parse(data).run
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: repositoryKeys.onboarding() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start onboarding', error })
		}
	})
}
