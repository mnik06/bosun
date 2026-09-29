import { useMutation, useQueryClient } from '@tanstack/react-query'

import { patchPlan, PlanModeSwitches, PlanSchema, type Plan, type PlanMode } from '~/entities/plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// Auto-plan mode and UI verification shape the grill, so they stay open only until the
// plan is written: its bullets are cut to one verify setting, and its decisions
// were taken by whoever was answering. AFK is read at each bullet, so it stays
// open for as long as there are bullets to run.
function grillOpen (plan: Plan): boolean {
	return plan.status === 'planning' && plan.bodyMd === null
}

export function PlanModeControls ({ plan }: { plan: Plan }) {
	const queryClient = useQueryClient()
	const toggle = useMutation({
		mutationFn: async (change: { mode: PlanMode, value: boolean }) => {
			const { data } = await apiClient.patch<unknown>(`/plans/${plan.id}`, { [change.mode]: change.value })

			return PlanSchema.parse(data)
		},
		onSuccess: (updated) => {
			patchPlan(queryClient, updated)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the plan\'s mode', error })
		}
	})
	const pending = toggle.isPending ? toggle.variables : null
	const modes = {
		verifyInUi: plan.verifyInUi,
		auto: plan.auto,
		afk: plan.afk,
		...(pending === null ? {} : { [pending.mode]: pending.value })
	}
	const locked = !grillOpen(plan)

	return (
		<PlanModeSwitches
			modes={modes}
			locked={{ verifyInUi: locked, auto: locked }}
			lockedReason="Fixed now that the plan is written."
			disabled={toggle.isPending}
			onChange={(mode, value) => {
				toggle.mutate({ mode, value })
			}}
		/>
	)
}
