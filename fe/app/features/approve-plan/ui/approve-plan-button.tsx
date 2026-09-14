import { Button } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { z } from 'zod'

import { BuildSchema, refreshAfterBuild } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

const ApproveRespSchema = z.object({ build: BuildSchema })

// The last thing a person does before review. Approving puts the plan in its
// repository's line; nothing else has to happen before it runs.
export function ApprovePlanButton ({ planId, disabled }: { planId: string, disabled: boolean }) {
	const queryClient = useQueryClient()
	const approve = useMutation({
		mutationFn: async () => {
			const { data } = await apiClient.post<unknown>(`/plans/${planId}/approve`)

			return ApproveRespSchema.parse(data).build
		},
		onSuccess: () => {
			refreshAfterBuild({ queryClient, planId })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not approve the plan', error })
		}
	})

	return (
		<Button
			size="compact-sm"
			leftSection={<Check size={14} />}
			loading={approve.isPending}
			disabled={disabled}
			onClick={() => {
				approve.mutate()
			}}
		>
			Approve
		</Button>
	)
}
