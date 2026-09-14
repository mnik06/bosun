import { Alert, Card, Code, Divider, Group, List, Spoiler, Stack, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import {
	configSource,
	describeConfigSource,
	OnboardingStatusBadge,
	useMachineOnboardingQuery,
	useRepositoriesQuery,
	type OnboardingRun,
	type Repository
} from '~/entities/repository'
import { OpenPullRequestButton } from '~/features/open-onboarding-pr'
import { ProvideInputsForm } from '~/features/provide-inputs'
import { StartOnboardingButton } from '~/features/start-onboarding'
import { formatRelativeTime } from '~/shared/lib'
import { OnboardingSteps } from '~/widgets/onboarding-report/ui/onboarding-steps'

function ReportActions ({
	machine,
	run,
	repository
}: {
	machine: Machine,
	run: OnboardingRun,
	repository: Repository | null
}) {
	const hasConfig = run.config !== null || (repository !== null && configSource(repository) !== 'none')

	if (run.status === 'ready') {
		return (
			<Group gap="sm">
				<OpenPullRequestButton repositoryId={run.repositoryId} />
				<StartOnboardingButton machine={machine} phase="verify" label="Run verify again" again />
			</Group>
		)
	}

	if (run.status !== 'failed') {
		return null
	}

	return (
		<Group gap="sm">
			<StartOnboardingButton machine={machine} phase="discover" label="Start onboarding again" again />
			{hasConfig ? (
				<StartOnboardingButton machine={machine} phase="verify" label="Run verify again" again />
			) : null}
		</Group>
	)
}

function Assumptions ({ run }: { run: OnboardingRun }) {
	if (run.assumptions.length === 0) {
		return null
	}

	return (
		<Stack gap="xs">
			<Text size="sm" fw={600}>
				Assumptions
			</Text>
			<Text size="xs" c="dimmed">
				What discovery had to guess. Verify catches what does not run; what runs but is not how your
				team works is only visible here.
			</Text>
			<List size="sm" spacing={4}>
				{run.assumptions.map((assumption) => (
					<List.Item key={`${assumption.text}:${assumption.evidence}`}>
						{assumption.text}{' '}
						<Text component="span" size="xs" c="dimmed" className="font-mono">
							({assumption.evidence})
						</Text>
					</List.Item>
				))}
			</List>
		</Stack>
	)
}

export function OnboardingReport ({ machine }: { machine: Machine }) {
	const onboarding = useMachineOnboardingQuery({
		machineId: machine.id,
		enabled: machine.repositoryId != null
	})
	const repositories = useRepositoriesQuery()

	if (machine.repositoryId == null || onboarding.data == null) {
		return null
	}

	const { run } = onboarding.data
	const repository = repositories.data?.find((entry) => entry.id === run.repositoryId) ?? null

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Stack gap={2}>
					<Group gap="sm">
						<Text fw={600}>Onboarding</Text>
						<OnboardingStatusBadge status={run.status} />
					</Group>
					<Text size="xs" c="dimmed">
						{run.phase === 'discover' ? 'Discovery and verify' : 'Verify'} · started{' '}
						{formatRelativeTime(run.startedAt)}
						{repository === null ? '' : ` · config ${describeConfigSource(repository)}`}
					</Text>
				</Stack>

				{run.steps.length === 0 ? null : <OnboardingSteps steps={run.steps} />}

				{run.failureReason === null ? null : (
					<Alert color="red" variant="light" title="The run failed">
						<Text size="sm" className="break-words whitespace-pre-wrap">
							{run.failureReason}
						</Text>
					</Alert>
				)}

				<Assumptions run={run} />

				{run.config === null ? null : (
					<Spoiler maxHeight={0} showLabel="Show the config this run published" hideLabel="Hide the config">
						<Code block className="font-mono text-xs">
							{run.config}
						</Code>
					</Spoiler>
				)}

				{run.status === 'discovering' ? null : (
					<Stack gap="sm" id="onboarding-inputs">
						<Divider label="Inputs for this machine" labelPosition="left" />
						<ProvideInputsForm machine={machine} onboarding={onboarding.data} />
					</Stack>
				)}

				<ReportActions machine={machine} run={run} repository={repository} />
			</Stack>
		</Card>
	)
}
