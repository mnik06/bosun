import { Button } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FastForward } from 'lucide-react'

import { refreshAfterBuild } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { confirmAction, notifyError } from '~/shared/lib'

export function RunAnywayButton ({
	buildId,
	dependencyId,
	planId,
	provider
}: {
	buildId: string,
	dependencyId: string,
	planId: string,
	provider: string
}) {
	const queryClient = useQueryClient()
	const override = useMutation({
		mutationFn: async () => {
			await apiClient.post(`/builds/${buildId}/dependencies/${dependencyId}/override`)
		},
		onSuccess: () => {
			refreshAfterBuild({ queryClient, planId })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not remove the dependency', error })
		}
	})

	return (
		<Button
			size="compact-xs"
			variant="subtle"
			color="orange"
			leftSection={<FastForward size={12} />}
			loading={override.isPending}
			onClick={() => {
				confirmAction({
					title: 'Run anyway?',
					body: `This plan stops waiting on ${provider}. It starts from the default branch rather than from that work, and the removal is recorded against you.`,
					confirmLabel: 'Run anyway',
					cancelLabel: 'Keep waiting',
					color: 'orange',
					onConfirm: () => {
						override.mutate()
					}
				})
			}}
		>
			Run anyway
		</Button>
	)
}
