import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactElement, type ReactNode } from 'react'

import {
	dropPlan,
	patchPlan,
	refreshAfterBuild,
	refreshLine,
	refreshNeedsYou,
	refreshPlanDetail
} from '~/entities/plan/lib/plan-cache'
import { LineUiMsgSchema, type LineUiMsg } from '~/entities/plan/model/line-message'
import { PlanUiMsgSchema } from '~/entities/plan/model/plan-message'
import { subscribeToUiSocket } from '~/shared/api'

const RunActivityContext = createContext<Record<string, string>>({})
const IntegrationActivityContext = createContext<Record<string, string>>({})

// What each running session is doing now, keyed by run. The transcript is not kept
// in the browser: a build can run for hours and the answer to "what is it doing"
// is the activity line, not every token.
export function useRunActivity (): Record<string, string> {
	return useContext(RunActivityContext)
}

export function useIntegrationActivity (): Record<string, string> {
	return useContext(IntegrationActivityContext)
}

function handleLineMsg (queryClient: QueryClient, msg: Exclude<LineUiMsg, { type: 'run.activity' | 'integration.activity' }>): void {
	switch (msg.type) {
		case 'build.updated':
			refreshAfterBuild({ queryClient, planId: msg.build.planId })

			return
		case 'build.deleted':
			refreshAfterBuild({ queryClient, planId: msg.planId })

			return
		case 'line.changed':
			refreshLine(queryClient)

			return
		case 'plan.changed':
		case 'plan.decision':
			refreshPlanDetail(queryClient, msg.planId)

			return
		case 'needs_you.changed':
			refreshNeedsYou(queryClient)

			return
		case 'run.question':
			refreshPlanDetail(queryClient, msg.planId)
			refreshNeedsYou(queryClient)
	}
}

// Plan rows and build moves are pushed to every tab the project has open, so the
// board and the header stay live without being subscribed to any one plan.
export function PlansSocketProvider ({ children }: { children: ReactNode }): ReactElement {
	const queryClient = useQueryClient()
	const [runs, setRuns] = useState<Record<string, string>>({})
	const [integrations, setIntegrations] = useState<Record<string, string>>({})

	useEffect(() => {
		return subscribeToUiSocket({
			onMessage: (raw) => {
				const plan = PlanUiMsgSchema.safeParse(raw)

				if (plan.success && plan.data.type === 'plan.updated') {
					patchPlan(queryClient, plan.data.plan)

					return
				}

				if (plan.success && plan.data.type === 'plan.deleted') {
					dropPlan(queryClient, plan.data.planId)

					return
				}

				const line = LineUiMsgSchema.safeParse(raw)

				if (!line.success) {
					return
				}

				if (line.data.type === 'run.activity') {
					const { runId, label } = line.data

					setRuns((previous) => ({ ...previous, [runId]: label }))

					return
				}

				if (line.data.type === 'integration.activity') {
					const { integrationId, label } = line.data

					setIntegrations((previous) => ({ ...previous, [integrationId]: label }))

					return
				}

				handleLineMsg(queryClient, line.data)
			}
		})
	}, [queryClient])

	return (
		<RunActivityContext.Provider value={runs}>
			<IntegrationActivityContext.Provider value={integrations}>{children}</IntegrationActivityContext.Provider>
		</RunActivityContext.Provider>
	)
}
