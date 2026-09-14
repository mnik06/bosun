import { useMutation, useQueryClient } from '@tanstack/react-query'

import { planKeys, refreshAfterBuild, type PlanListEntry } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

interface Reorder {
	repositoryId: string
	buildIds: string[]
}

// The board repaints the new order before the request lands: a card that jumps
// back for a second after being dropped reads as a drop that did not take.
export function useReorderLine () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (reorder: Reorder) => {
			await apiClient.put('/line/order', reorder)
		},
		onMutate: (reorder) => {
			queryClient.setQueryData<PlanListEntry[]>(planKeys.list(), (previous) =>
				previous?.map((entry) => {
					const index = entry.build === null ? -1 : reorder.buildIds.indexOf(entry.build.id)

					return entry.build === null || index === -1
						? entry
						: { ...entry, build: { ...entry.build, position: index } }
				})
			)
		},
		onSettled: () => {
			refreshAfterBuild({ queryClient, planId: null })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not reorder the line', error })
		}
	})
}
