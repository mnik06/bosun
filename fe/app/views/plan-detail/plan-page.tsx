import {
	Alert,
	Anchor,
	Badge,
	Center,
	Container,
	Group,
	Loader,
	Stack,
	Tabs,
	Text,
	Tooltip
} from '@mantine/core'
import { Link } from 'react-router'

import { useMachineQuery } from '~/entities/machine'
import { PlanStatusBadge, usePlanQuery, usePlanStream } from '~/entities/plan'
import { DiscardPlanButton } from '~/features/discard-plan'
import { toErrorMessage } from '~/shared/lib'
import { PlanArtifact } from '~/widgets/plan-artifact'
import { PlanChat } from '~/widgets/plan-chat'

import type { Route } from './+types/plan-page'

function MachineLine ({ machineId }: { machineId: string }) {
	const machine = useMachineQuery(machineId)

	return (
		<Anchor component={Link} to={`/machines/${machineId}`} size="xs" c="dimmed">
			{machine.data?.name ?? machineId}
		</Anchor>
	)
}

export default function PlanPage ({ params }: Route.ComponentProps) {
	const { planId } = params
	const { data, isPending, error } = usePlanQuery(planId)
	const stream = usePlanStream(planId)

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Container size="md" py="xl">
				<Alert color="red" title="Could not load this plan">
					{toErrorMessage(error, 'Unknown error')}
				</Alert>
			</Container>
		)
	}

	const { plan, messages, acs, slices, blockedBy, decisions } = data
	const planning = plan.status === 'planning'

	const header = (
		<Group justify="space-between" align="center">
			<Group gap="sm">
				<Anchor component={Link} to="/plans" size="sm">
					← Plans
				</Anchor>
				<Text size="sm" fw={600}>
					<Text component="span" c="dimmed" fw={500}>
						#{plan.number}
					</Text>{' '}
					{plan.title ?? 'Untitled'}
				</Text>
				<MachineLine machineId={plan.machineId} />
				<PlanStatusBadge plan={plan} />
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
			<DiscardPlanButton planId={plan.id} />
		</Group>
	)

	const chat = (
		<PlanChat
			plan={plan}
			messages={messages}
			streamingText={stream.streamingText}
			activity={stream.activity}
		/>
	)

	const artifact = (
		<PlanArtifact
			plan={plan}
			acs={acs}
			slices={slices}
			decisions={decisions}
			editable={!planning}
		/>
	)

	// While the grill runs the two halves are watched side by side; once it is
	// over the artifact is the page and the transcript is the receipt.
	return (
		<Container size={planning ? 'xl' : 'md'} py="lg">
			<Stack gap="lg">
				{header}

				{planning ? (
					<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
						<div className="min-w-0">{chat}</div>
						<div className="min-w-0">{artifact}</div>
					</div>
				) : (
					<Tabs defaultValue="plan">
						<Tabs.List mb="lg">
							<Tabs.Tab value="plan">Plan</Tabs.Tab>
							<Tabs.Tab value="transcript">Transcript</Tabs.Tab>
						</Tabs.List>
						<Tabs.Panel value="plan">{artifact}</Tabs.Panel>
						<Tabs.Panel value="transcript">{chat}</Tabs.Panel>
					</Tabs>
				)}
			</Stack>
		</Container>
	)
}
