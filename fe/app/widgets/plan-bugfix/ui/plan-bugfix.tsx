import { Group, ScrollArea, Stack, Text } from '@mantine/core'
import { useEffect, useRef } from 'react'

import { useMachinesQuery } from '~/entities/machine'
import {
	bugfixBlockReason,
	resolvePlanState,
	useBugfixMessagesQuery,
	useLineQuery,
	usePlanBugsQuery,
	type BugfixStream,
	type PlanDetail
} from '~/entities/plan'
import { CloseBugfixButton } from '~/features/close-bugfix-session'
import { BugfixComposer } from '~/features/say-to-bugfix'
import { SectionLoader } from '~/shared/ui'
import { BugStatusPanel } from '~/widgets/plan-bugfix/ui/bug-status-panel'
import { BugfixTranscript } from '~/widgets/plan-bugfix/ui/bugfix-transcript'

export function PlanBugfix ({ detail, stream }: { detail: PlanDetail, stream: BugfixStream }) {
	const { plan, build } = detail
	const bottom = useRef<HTMLDivElement>(null)
	const messages = useBugfixMessagesQuery(plan.id)
	const bugs = usePlanBugsQuery(plan.id)
	const machines = useMachinesQuery()
	const line = useLineQuery()
	const state = resolvePlanState(plan)
	const live = state === 'in_review' || state === 'fixing_bugs'
	const machine = build?.machineId == null ? null : (machines.data?.find((entry) => entry.id === build.machineId) ?? null)
	const capacity = line.data?.capacity.find((entry) => entry.machineId === build?.machineId)
	// While the machine list is still loading, `machine` would otherwise read as
	// "none assigned" and flash a wrong block reason for a build that has one.
	let blockedReason: string | null = null

	if (!live) {
		blockedReason = 'Bug fixing is only available while a plan is in review or a session is already running.'
	} else if (!machines.isPending) {
		blockedReason = bugfixBlockReason({ machine, capacity })
	}

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: 'end' })
	}, [messages.data?.length, stream.streamingText])

	if (build === null) {
		return null
	}

	return (
		<div className="flex min-h-0 grow flex-col gap-3 md:flex-row">
			<div className="flex min-h-0 min-w-0 grow flex-col gap-3">
				<ScrollArea className="min-h-0 grow" type="auto">
					{messages.isPending ? (
						<SectionLoader />
					) : (
						<Stack gap="lg" pr="md">
							<BugfixTranscript
								planId={plan.id}
								messages={messages.data ?? []}
								streamingText={stream.streamingText}
								activity={stream.activity}
							/>
							<div ref={bottom} />
						</Stack>
					)}
				</ScrollArea>

				<div className="shrink-0 px-1 pb-1">
					<BugfixComposer planId={plan.id} blockedReason={blockedReason} busy={state === 'fixing_bugs'} />
				</div>
			</div>

			<div className="flex min-h-0 shrink-0 flex-col gap-2 md:w-80">
				<Group justify="space-between" gap="xs">
					<Text size="sm" fw={600}>
						Bugs
					</Text>
					{state === 'fixing_bugs' ? <CloseBugfixButton planId={plan.id} /> : null}
				</Group>
				<ScrollArea className="min-h-0 grow" type="auto">
					{bugs.isPending ? <SectionLoader /> : <BugStatusPanel bugs={bugs.data ?? []} />}
				</ScrollArea>
			</div>
		</div>
	)
}
