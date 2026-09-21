import { Anchor, Button, Card, Group, Spoiler, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { Link } from 'react-router'

import { planLabel, usePlanProposalsQuery, type PlanProposal } from '~/entities/plan'
import { NewPlanModal } from '~/features/create-plan'
import { useDismissProposal } from '~/features/dismiss-proposal'

function ProposalCard ({ proposal, onStart }: { proposal: PlanProposal, onStart: () => void }) {
	const dismiss = useDismissProposal()

	return (
		<Card withBorder padding="sm" radius="md">
			<Stack gap={6}>
				<Group justify="space-between" align="start" gap="sm">
					<Stack gap={2} className="min-w-0">
						<Text size="sm" fw={600}>
							{proposal.title}
						</Text>
						<Text size="xs" c="dimmed">
							From the verify pass of{' '}
							<Anchor component={Link} to={`/plans/${proposal.sourcePlanId}`} size="xs">
								{planLabel({ number: proposal.sourcePlanNumber, title: proposal.sourcePlanTitle })}
							</Anchor>
						</Text>
					</Stack>
					<Group gap="xs" wrap="nowrap">
						<Button
							size="xs"
							variant="subtle"
							color="gray"
							loading={dismiss.isPending}
							onClick={() => { dismiss.mutate(proposal.id) }}
						>
							Dismiss
						</Button>
						<Button size="xs" variant="light" onClick={onStart}>
							Start planning
						</Button>
					</Group>
				</Group>
				<Spoiler
					maxHeight={60}
					showLabel="Show the whole brief"
					hideLabel="Hide"
					styles={{ control: { fontSize: 'var(--mantine-font-size-xs)' } }}
				>
					<Text size="xs" c="dimmed" className="whitespace-pre-wrap [overflow-wrap:anywhere]">
						{proposal.input}
					</Text>
				</Spoiler>
			</Stack>
		</Card>
	)
}

// Work a fix session found outside its own plan and would not do inside it.
// Nothing happens to one until a person starts planning from it or dismisses it,
// so this renders nothing at all while there is none.
export function PlanProposals () {
	const proposals = usePlanProposalsQuery()
	const [opened, { open, close }] = useDisclosure(false)
	const [starting, setStarting] = useState<PlanProposal | null>(null)
	const items = proposals.data ?? []

	return (
		<>
			{items.length === 0 ? null : (
				<Stack gap="xs" className="mb-4">
					<div>
						<Text size="sm" fw={600}>
							Proposed plans
						</Text>
						<Text size="xs" c="dimmed">
							Found by a verify pass in code its plan did not own. Start planning from one, or dismiss it.
						</Text>
					</div>
					{items.map((proposal) => (
						<ProposalCard
							key={proposal.id}
							proposal={proposal}
							onStart={() => {
								setStarting(proposal)
								open()
							}}
						/>
					))}
				</Stack>
			)}

			<NewPlanModal opened={opened} onClose={close} proposal={starting} />
		</>
	)
}
