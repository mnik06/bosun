import { Switch, Tooltip } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { patchPlan, PlanSchema, type Plan } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// A bullet already running keeps the tools it started with, so the switch
// promises only the next bullet, never the one on screen.
export function AfkSwitch ({ plan }: { plan: Plan }) {
	const queryClient = useQueryClient()
	const toggle = useMutation({
		mutationFn: async (afk: boolean) => {
			const { data } = await apiClient.patch<unknown>(`/plans/${plan.id}`, { afk })

			return PlanSchema.parse(data)
		},
		onSuccess: (updated) => {
			patchPlan(queryClient, updated)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change AFK execution', error })
		}
	})

	return (
		<Tooltip
			multiline
			w={280}
			withArrow
			label="Bullets cannot ask a question, and the re-check after verify's fixes is skipped. Applies from the next bullet."
		>
			<Switch
				size="xs"
				label="AFK"
				checked={toggle.isPending ? toggle.variables : plan.afk}
				disabled={toggle.isPending}
				onChange={(event) => {
					toggle.mutate(event.currentTarget.checked)
				}}
			/>
		</Tooltip>
	)
}
