import { useMutation, useQueryClient } from '@tanstack/react-query'

import { PlanSchema, patchPlan, refreshNeedsYou, type Plan } from '~/entities/plan'
import type { CreatePlanForm } from '~/features/create-plan/model/create-plan'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

// Started from a proposal, the same form goes to the proposal's own route, which
// settles the proposal in the same request that starts the plan.
async function createPlan (opts: { form: CreatePlanForm, proposalId: string | null }): Promise<Plan> {
	const path = opts.proposalId === null ? '/plans' : `/plans/proposals/${opts.proposalId}/start`
	const { data } = await apiClient.post<unknown>(path, opts.form)

	return PlanSchema.parse(data)
}

export function useCreatePlan () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: createPlan,
		onSuccess: (plan, { proposalId }) => {
			patchPlan(queryClient, plan)

			if (proposalId !== null) {
				refreshNeedsYou(queryClient)
			}
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not start planning', error })
		}
	})
}
