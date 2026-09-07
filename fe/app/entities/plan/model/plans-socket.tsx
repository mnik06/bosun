import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactElement, type ReactNode } from 'react'

import { dropPlan, patchPlan } from '~/entities/plan/lib/plan-cache'
import { PlanUiMsgSchema } from '~/entities/plan/model/plan-message'
import { subscribeToUiSocket } from '~/shared/api'

// Plan rows are pushed to every tab the owner has open, so the list stays live
// without being subscribed to any one plan's transcript.
export function PlansSocketProvider ({ children }: { children: ReactNode }): ReactElement {
	const queryClient = useQueryClient()

	useEffect(() => {
		return subscribeToUiSocket({
			onMessage: (raw) => {
				const parsed = PlanUiMsgSchema.safeParse(raw)

				if (!parsed.success) {
					return
				}

				if (parsed.data.type === 'plan.updated') {
					patchPlan(queryClient, parsed.data.plan)

					return
				}

				if (parsed.data.type === 'plan.deleted') {
					dropPlan(queryClient, parsed.data.planId)
				}
			}
		})
	}, [queryClient])

	return <>{children}</>
}
