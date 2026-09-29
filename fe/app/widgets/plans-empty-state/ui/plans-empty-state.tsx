import { Anchor, Button, Card, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { ClipboardList, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { machineKind, repositoryCloning, useMachinesQuery } from '~/entities/machine'
import { useActiveProject } from '~/entities/project'

const STEPS = [
	'Paste a ticket, a bug report or a half-formed idea.',
	'The grill asks what it needs to know, one question at a time.',
	'The plan it writes joins the line, where machines build it.'
]

// Planning runs in a machine's checkout, so the first plan cannot start until one
// with a repository is online — worth saying here rather than after the click.
function useCanPlan (): boolean | null {
	const machines = useMachinesQuery()

	if (machines.data === undefined) {
		return null
	}

	return machines.data.some(
		(machine) => machine.status === 'online' && machineKind(machine) !== 'unattached' && !repositoryCloning(machine)
	)
}

// Shown on Board and List, which hold active plans only. A project whose plans
// are all merged or cancelled is told where they went.
export function PlansEmptyState ({ hasHistory, onShowHistory }: { hasHistory: boolean, onShowHistory: () => void }) {
	const { isLeader } = useActiveProject()
	const canPlan = useCanPlan()

	return (
		<Card withBorder padding="xl" radius="md" className="mx-auto mt-8 w-full max-w-xl">
			<Stack align="center" gap="md" className="text-center">
				<ThemeIcon variant="light" size={56} radius="xl">
					<ClipboardList size={28} />
				</ThemeIcon>

				<Stack gap={4} align="center">
					<Title order={3}>{hasHistory ? 'No active plans' : 'No plans yet'}</Title>
					<Text size="sm" c="dimmed">
						{hasHistory ? (
							<>
								Everything so far is merged or cancelled —{' '}
								<Anchor component="button" type="button" size="sm" onClick={onShowHistory}>
									see History
								</Anchor>
								.
							</>
						) : (
							'Every piece of work starts as a plan.'
						)}
					</Text>
				</Stack>

				<Stack gap={6} className="w-full text-left">
					{STEPS.map((step, index) => (
						<Text key={step} size="sm">
							<Text component="span" c="dimmed" fw={600} mr={8}>
								{index + 1}.
							</Text>
							{step}
						</Text>
					))}
				</Stack>

				<Button component={Link} to="/plans/new" leftSection={<Plus size={16} />} disabled={canPlan === false}>
					{hasHistory ? 'Start a plan' : 'Start your first plan'}
				</Button>

				{canPlan === false ? (
					<Text size="xs" c="dimmed">
						No machine with a repository is online.{' '}
						{isLeader ? (
							<Anchor component={Link} to="/" size="xs">
								Set one up on Machines
							</Anchor>
						) : (
							'Ask a project leader to bring one online.'
						)}
					</Text>
				) : null}
			</Stack>
		</Card>
	)
}
