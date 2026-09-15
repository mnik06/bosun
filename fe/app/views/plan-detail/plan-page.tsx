import { Tabs, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import {
	defaultPlanTab,
	PLAN_TAB_LABEL,
	resolvePlanState,
	usePlanQuery,
	usePlanStream,
	visiblePlanTabs,
	type PlanDetail,
	type PlanStream,
	type PlanTab
} from '~/entities/plan'
import { useMarkPlanNotificationsRead } from '~/features/mark-notification-read'
import { QueryErrorAlert, SectionLoader } from '~/shared/ui'
import { PlanArtifact } from '~/widgets/plan-artifact'
import { PlanChanges } from '~/widgets/plan-changes'
import { PlanChat } from '~/widgets/plan-chat'
import { PlanExecution } from '~/widgets/plan-execution'
import { PlanHeader } from '~/widgets/plan-header'
import { PlanVerification } from '~/widgets/plan-verification'

import type { Route } from './+types/plan-page'

function Scrolled ({ tab, detail }: { tab: Exclude<PlanTab, 'chat'>, detail: PlanDetail }) {
	switch (tab) {
		case 'plan':
			return (
				<PlanArtifact
					plan={detail.plan}
					acs={detail.acs}
					slices={detail.slices}
					decisions={detail.decisions}
					dependencies={detail.dependencies}
					amendments={detail.amendments}
					buildId={detail.build?.id ?? null}
				/>
			)
		case 'execution':
			return <PlanExecution detail={detail} />
		case 'changes':
			return <PlanChanges detail={detail} />
		case 'verification':
			return <PlanVerification detail={detail} />
	}
}

function TabBody ({ tab, detail, stream }: { tab: PlanTab, detail: PlanDetail, stream: PlanStream }) {
	if (tab === 'chat') {
		return (
			<div className="flex min-h-0 grow flex-col">
				<PlanChat
					plan={detail.plan}
					messages={detail.messages}
					streamingText={stream.streamingText}
					activity={stream.activity}
				/>
			</div>
		)
	}

	return (
		<div className="min-h-0 grow overflow-y-auto pr-2">
			<Scrolled tab={tab}
				detail={detail} />
		</div>
	)
}

export default function PlanPage ({ params }: Route.ComponentProps) {
	const { planId } = params
	const { data, isPending, error } = usePlanQuery(planId)
	const stream = usePlanStream(planId)
	const { mutate: markPlanNotificationsRead } = useMarkPlanNotificationsRead()
	const [searchParams] = useSearchParams()

	// Opening a plan is what clears its board badge: any notification logged for
	// it up to this point is read the moment its page is on screen, not only when
	// somebody clicks through the bell.
	useEffect(() => {
		markPlanNotificationsRead(planId)
	}, [planId, markPlanNotificationsRead])
	// Seeded from the URL, not bound to it: a pull request bosun opened links
	// straight at a tab, and the tabs are otherwise a local control whose every
	// click has no business in the history stack.
	const [tab, setTab] = useState<string | null>(searchParams.get('tab'))

	if (isPending) {
		return <SectionLoader />
	}

	if (error) {
		return <QueryErrorAlert title="Could not load this plan" error={error} />
	}

	const tabs = visiblePlanTabs(data)
	// Until somebody picks a tab, the page follows the plan: it opens on what the
	// plan's state makes relevant and moves with it as the plan moves.
	const active = tabs.find((entry) => entry === tab) ?? defaultPlanTab({ state: resolvePlanState(data.plan), tabs })

	// The page owns the viewport: the tab bodies scroll, the page never does.
	return (
		<div className="flex h-[var(--app-content-height)] min-h-0 flex-col gap-3 overflow-hidden">
			<PlanHeader detail={data} />

			<Tabs value={active} onChange={setTab} className="flex min-h-0 grow flex-col">
				<Tabs.List mb="sm" className="shrink-0 flex-nowrap overflow-x-auto">
					{tabs.map((entry) => (
						<Tabs.Tab key={entry} value={entry} className="shrink-0">
							{PLAN_TAB_LABEL[entry]}
						</Tabs.Tab>
					))}
				</Tabs.List>

				{data.plan.title === null && active === 'plan' ? (
					<Text size="sm" c="dimmed">
						The plan appears here, whole, the moment the session publishes it.
					</Text>
				) : (
					<TabBody tab={active} detail={data} stream={stream} />
				)}
			</Tabs>
		</div>
	)
}
