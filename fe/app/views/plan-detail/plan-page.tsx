import { ActionIcon, Alert, Anchor, Badge, Card, Center, Group, Loader, Text, Tooltip } from '@mantine/core'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { usePlanQuery, usePlanStream, type Ac, type Plan, type Slice } from '~/entities/plan'
import { DeletePlanButton } from '~/features/delete-plan'
import { toErrorMessage } from '~/shared/lib'
import { SplitPane } from '~/shared/ui'
import { PlanArtifact } from '~/widgets/plan-artifact'
import { PlanChat } from '~/widgets/plan-chat'

import type { Route } from './+types/plan-page'

// A plan is published in one call, so it is either fully formed or not there at
// all. Until it is, the pane says so rather than showing half an artifact the
// session is still assembling.
function isPublished (opts: { plan: Plan, acs: Ac[], slices: Slice[] }): boolean {
	return opts.plan.title !== null && opts.acs.length > 0 && opts.slices.length > 0
}

function ArtifactPane ({
	children,
	expanded,
	onToggle
}: {
	children: React.ReactNode,
	expanded: boolean,
	onToggle: () => void
}) {
	return (
		<Card withBorder radius="md" padding="md" className="flex min-h-0 grow flex-col">
			<Group justify="space-between" align="center" mb="sm">
				<Text size="xs" c="dimmed">
					The plan
				</Text>
				<Tooltip label={expanded ? 'Show the chat again' : 'Fill the page with the plan'}>
					<ActionIcon
						variant="subtle"
						aria-label={expanded ? 'Collapse the plan' : 'Expand the plan'}
						onClick={onToggle}
					>
						{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
					</ActionIcon>
				</Tooltip>
			</Group>

			<div className="min-h-0 grow overflow-y-auto pr-2">{children}</div>
		</Card>
	)
}

export default function PlanPage ({ params }: Route.ComponentProps) {
	const { planId } = params
	const { data, isPending, error } = usePlanQuery(planId)
	const stream = usePlanStream(planId)
	const [expanded, setExpanded] = useState(false)

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load this plan">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	const { plan, messages, acs, slices, blockedBy, decisions } = data
	const published = isPublished({ plan, acs, slices })

	const chat = (
		<PlanChat
			plan={plan}
			messages={messages}
			streamingText={stream.streamingText}
			activity={stream.activity}
		/>
	)

	const artifact = (
		<ArtifactPane
			expanded={expanded}
			onToggle={() => {
				setExpanded((previous) => !previous)
			}}
		>
			{published ? (
				<PlanArtifact plan={plan} acs={acs} slices={slices} decisions={decisions} />
			) : (
				<Group gap="xs" align="center">
					<Loader size={14} />
					<Text size="sm" c="dimmed">
						The plan appears here, whole, the moment the session publishes it.
					</Text>
				</Group>
			)}
		</ArtifactPane>
	)

	// The page owns the viewport: the two panes scroll, the page never does.
	return (
		<div className="flex h-[calc(100dvh_-_var(--app-shell-header-offset)_-_2_*_var(--mantine-spacing-md))] min-h-0 flex-col gap-3 overflow-hidden">
			<Group justify="space-between" align="center" wrap="nowrap">
				<Group gap="sm" wrap="nowrap" className="min-w-0">
					<Anchor component={Link} to="/plans" size="sm">
						← Plans
					</Anchor>
					<Text size="sm" fw={600} truncate>
						<Text component="span" c="dimmed" fw={500}>
							#{plan.number}
						</Text>{' '}
						{plan.title ?? 'Untitled'}
					</Text>
					{plan.status === 'planning' && published ? <Loader size={12} /> : null}
					{blockedBy.map((blocker) => (
						<Tooltip key={blocker.id} label={blocker.title ?? 'Untitled'}>
							<Badge
								component={Link}
								to={`/plans/${blocker.id}`}
								size="sm"
								color="orange"
								variant="light"
								className="cursor-pointer"
							>
								blocked by #{blocker.number}
							</Badge>
						</Tooltip>
					))}
				</Group>

				<DeletePlanButton planId={plan.id} />
			</Group>

			{expanded ? (
				artifact
			) : (
				<SplitPane
					initial={0.45}
					left={<div className="flex min-h-0 grow flex-col pr-2">{chat}</div>}
					right={<div className="flex min-h-0 grow flex-col pl-2">{artifact}</div>}
				/>
			)}
		</div>
	)
}
