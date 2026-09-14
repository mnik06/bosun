import { useMutation, useQueryClient } from '@tanstack/react-query'

import { BuildSchema, refreshAfterBuild, type Build } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export type BuildAction = 'hold' | 'release' | 'cancel' | 'front' | 'retry' | 'fix-again' | 'accept-gaps'

const FAILURE_TITLE: Record<BuildAction, string> = {
	hold: 'Could not hold the plan',
	release: 'Could not release the plan',
	cancel: 'Could not cancel the build',
	front: 'Could not move the plan to the front',
	retry: 'Could not retry the build',
	'fix-again': 'Could not start another fix',
	'accept-gaps': 'Could not accept the known gaps'
}

export function useControlBuild (buildId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (action: BuildAction): Promise<Build> => {
			const { data } = await apiClient.post<unknown>(`/builds/${buildId}/${action}`)

			return BuildSchema.parse(data)
		},
		onSuccess: (build) => {
			refreshAfterBuild({ queryClient, planId: build.planId })
		},
		onError: (error: unknown, action) => {
			notifyError({ title: FAILURE_TITLE[action], error })
		}
	})
}
