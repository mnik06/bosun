import { useQuery } from '@tanstack/react-query'

import { PlanProposalListSchema, type PlanProposal } from '~/entities/plan/model/proposal'
import { apiClient, getActiveProjectId } from '~/shared/api'

export const proposalKeys = {
	all: () => ['plan-proposals', getActiveProjectId()] as const
}

export async function fetchPlanProposals (): Promise<PlanProposal[]> {
	const { data } = await apiClient.get<unknown>('/plans/proposals')

	return PlanProposalListSchema.parse(data)
}

export function usePlanProposalsQuery () {
	return useQuery({ queryKey: proposalKeys.all(), queryFn: fetchPlanProposals })
}
