import { ActionIcon, Alert, Anchor, Badge, Card, Center, Group, Loader, Tabs, Text, Tooltip } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { usePlanQuery, usePlanStream, type Ac, type Plan, type Slice } from '~/entities/plan'
import { ConfirmPlanButton } from '~/features/confirm-plan'
import { DeletePlanButton } from '~/features/delete-plan'
import { toErrorMessage } from '~/shared/lib'
import { SplitPane } from '~/shared/ui'
import { PlanArtifact } from '~/widgets/plan-artifact'
import { PlanChat } from '~/widgets/plan-chat'
import { PlanExecutionPanel } from '~/widgets/plan-execution'

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
	expandable,
	onToggle
}: {
	children: React.ReactNode,
	expanded: boolean,
	expandable: boolean,
	onToggle: () => void
}) {
	return (
		<Card withBorder radius="md" padding="md" className="flex min-h-0 grow flex-col">
			<Group justify="space-between" align="center" mb="sm">
				<Text size="xs" c="dimmed">
					The plan
				</Text>
				{expandable ? (
					<Tooltip label={expanded ? 'Show the chat again' : 'Fill the page with the plan'}>
						<ActionIcon
							variant="subtle"
							aria-label={expanded ? 'Collapse the plan' : 'Expand the plan'}
							onClick={onToggle}
						>
							{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
						</ActionIcon>
					</Tooltip>
				) : null}
			</Group>

			<div className="min-h-0 grow overflow-y-auto pr-2">{children}</div>
		</Card>
	)
}

function PlanActions ({
	plan,
	published,
	deletable
}: {
	plan: Plan,
	published: boolean,
	deletable: boolean
}) {
	return (
		<Group gap="xs" wrap="nowrap" className="shrink-0">
			{published ? <ConfirmPlanButton plan={plan} /> : null}
			{deletable ? <DeletePlanButton planId={plan.id} /> : null}
		</Group>
	)
}

export default function PlanPage ({ params }: Route.ComponentProps) {
	const { planId } = params
	const { data, isPending, error } = usePlanQuery(planId)
	const stream = usePlanStream(planId)
	const [expanded, setExpanded] = useState(false)
	const [tab, setTab] = useState<string | null>(null)
	// Read synchronously rather than in an effect: the two layouts are different
	// enough that settling into the right one a frame later reads as a glitch.
	const wide = useMediaQuery('(width >= 48em)', true, { getInitialValueInEffect: false })

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

	const { plan, execution, messages, acs, slices, blockedBy, decisions } = data
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
			expandable={wide}
			onToggle={() => {
				setExpanded((previous) => !previous)
			}}
		>
			{published ? (
				<PlanArtifact plan={plan} acs={acs} slices={slices} decisions={decisions} />
			) : (
				<Text size="sm" c="dimmed">
					The plan appears here, whole, the moment the session publishes it.
				</Text>
			)}
		</ArtifactPane>
	)

	// Only once the plan has been signed off: before that there is nothing to run,
	// and a tab that exists to say so is a tab nobody needs.
	const showExecution = plan.confirmedAt !== null || execution != null

	// There is no room for two panes side by side on a phone, so the chat stops
	// being half of the plan tab and becomes a tab of its own.
	const tabs = [
		...(wide ? [] : [{ value: 'chat', label: 'Chat' }]),
		{ value: 'plan', label: 'Plan' },
		...(showExecution ? [{ value: 'execution', label: 'Execution' }] : [])
	]
	// The chat is where a plan is actually worked on, so on a phone — where it is a
	// tab of its own — it is what the page opens on.
	const fallback = wide ? 'plan' : 'chat'
	const active = tabs.some((entry) => entry.value === tab) ? tab : fallback

	// The page owns the viewport: the two panes scroll, the page never does.
	return (
		<div className="flex h-[var(--app-content-height)] min-h-0 flex-col gap-3 overflow-hidden">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
				<Group gap="sm" wrap="nowrap" className="min-w-0">
					{/* Without `shrink-0` the back link is the first thing the row gives
					    up, and it breaks across two lines beside a full-width title. */}
					<Anchor
						component={Link}
						to="/plans"
						size="sm"
						className="shrink-0 whitespace-nowrap"
					>
						← Plans
					</Anchor>
					{wide ? null : <DeletePlanButton planId={plan.id} iconOnly className="shrink-0" />}
					<Text size="sm" fw={600} truncate className="min-w-0 grow">
						<Text component="span" c="dimmed" fw={500}>
							#{plan.number}
						</Text>{' '}
						{plan.title ?? 'Untitled'}
					</Text>
					{blockedBy.map((blocker) => (
						<Tooltip key={blocker.id} label={blocker.title ?? 'Untitled'}>
							<Badge
								component={Link}
								to={`/plans/${blocker.id}`}
								size="sm"
								color="orange"
								variant="light"
								className="shrink-0 cursor-pointer"
							>
								blocked by #{blocker.number}
							</Badge>
						</Tooltip>
					))}
				</Group>

				<PlanActions plan={plan} published={published} deletable={wide} />
			</div>

			<Tabs value={active} onChange={setTab} className="flex min-h-0 grow flex-col">
				<Tabs.List mb="sm">
					{tabs.map((entry) => (
						<Tabs.Tab key={entry.value} value={entry.value}>
							{entry.label}
						</Tabs.Tab>
					))}
				</Tabs.List>

				{/* Rendered by hand rather than through Tabs.Panel: the panel is hidden
				    with a display rule, which fights the flex column the two scrolling
				    panes are laid out in. */}
				{active === 'execution' ? (
					<div className="min-h-0 grow overflow-y-auto pr-2">
						<PlanExecutionPanel
							execution={execution ?? null}
							summary={plan.summary ?? null}
							summarisedAt={plan.summarisedAt ?? null}
						/>
					</div>
				) : null}

				{active === 'chat' ? <div className="flex min-h-0 grow flex-col">{chat}</div> : null}

				{active === 'plan' ? (
					<div className="flex min-h-0 grow flex-col">
						{wide && !expanded ? (
							<SplitPane
								initial={2 / 3}
								left={<div className="flex min-h-0 grow flex-col pr-2">{chat}</div>}
								right={<div className="flex min-h-0 grow flex-col pl-2">{artifact}</div>}
							/>
						) : (
							artifact
						)}
					</div>
				) : null}
			</Tabs>
		</div>
	)
}
