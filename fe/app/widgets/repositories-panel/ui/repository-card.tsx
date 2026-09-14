import { Anchor, Button, Card, Collapse, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import {
	describeConfigSource,
	OnboardingStatusBadge,
	useRepositoryOnboardingQuery,
	type OnboardingRun,
	type Repository
} from '~/entities/repository'
import { ConfigDraftEditor } from '~/features/edit-config-draft'
import { OpenPullRequestButton } from '~/features/open-onboarding-pr'
import { formatRelativeTime } from '~/shared/lib'

function Discovery ({ run }: { run: OnboardingRun | null }) {
	if (run === null) {
		return (
			<Text size="sm" c="dimmed">
				Not onboarded yet — start it from a machine with this repository attached.
			</Text>
		)
	}

	return (
		<Group gap="sm">
			<Text size="sm">Discovery</Text>
			<OnboardingStatusBadge status={run.status} />
			<Text size="xs" c="dimmed">
				{formatRelativeTime(run.startedAt)} · {run.requirements.length} inputs · {run.assumptions.length}{' '}
				assumptions
			</Text>
		</Group>
	)
}

function MachineRuns ({ repository, machines, runs }: { repository: Repository, machines: Machine[], runs: OnboardingRun[] }) {
	const attached = machines.filter((machine) => machine.repositoryId === repository.id)
	const idle = attached.filter((machine) => !runs.some((run) => run.machineId === machine.id))

	if (runs.length === 0 && idle.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				No machine has this repository attached.
			</Text>
		)
	}

	return (
		<Stack gap={6}>
			{runs.map((run) => (
				<Group key={run.id} gap="sm" wrap="wrap">
					<Anchor component={Link} to={`/machines/${run.machineId}`} size="sm">
						{machines.find((machine) => machine.id === run.machineId)?.name ?? run.machineId}
					</Anchor>
					<OnboardingStatusBadge status={run.status} />
					{run.failureReason === null ? null : (
						<Text size="xs" c="red" className="break-words">
							{run.failureReason}
						</Text>
					)}
				</Group>
			))}
			{idle.map((machine) => (
				<Group key={machine.id} gap="sm">
					<Anchor component={Link} to={`/machines/${machine.id}`} size="sm">
						{machine.name}
					</Anchor>
					<Text size="xs" c="dimmed">
						not verified
					</Text>
				</Group>
			))}
		</Stack>
	)
}

export function RepositoryCard ({ repository, machines }: { repository: Repository, machines: Machine[] }) {
	const onboarding = useRepositoryOnboardingQuery(repository.id)
	const [editing, { toggle }] = useDisclosure(false)
	const discovery = onboarding.data?.discovery ?? null
	const runs = onboarding.data?.runs ?? []
	const ready = [discovery, ...runs].some((run) => run?.status === 'ready')

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Group justify="space-between" align="start" gap="sm">
					<Stack gap={2} className="min-w-0">
						<Text fw={600} className="break-all">
							{repository.fullName}
						</Text>
						<Text size="xs" c="dimmed">
							Config {describeConfigSource(repository)}
						</Text>
					</Stack>

					<Button variant="subtle" size="xs" onClick={toggle}>
						{editing ? 'Close draft' : 'Edit draft'}
					</Button>
				</Group>

				<Collapse expanded={editing}>
					<ConfigDraftEditor repository={repository} />
				</Collapse>

				<Discovery run={discovery} />
				<MachineRuns repository={repository} machines={machines} runs={runs} />

				{ready ? <OpenPullRequestButton repositoryId={repository.id} /> : null}
			</Stack>
		</Card>
	)
}
