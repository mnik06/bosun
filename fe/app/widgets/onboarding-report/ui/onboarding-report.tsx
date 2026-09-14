import { Alert, Anchor, Card, Center, Collapse, Group, Loader, Progress, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link } from 'react-router'

import type { Machine } from '~/entities/machine'
import {
	configSource,
	describeConfigSource,
	onboardingProgress,
	OnboardingStatusBadge,
	useMachineOnboardingQuery,
	useRepositoriesQuery,
	type OnboardingAssumption,
	type OnboardingRun,
	type Repository
} from '~/entities/repository'
import { OpenPullRequestButton } from '~/features/open-onboarding-pr'
import { StartOnboardingButton } from '~/features/start-onboarding'
import { formatRelativeTime } from '~/shared/lib'
import { displaySteps, pendingStep } from '~/widgets/onboarding-report/lib/display-steps'
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

function progressColor (status: OnboardingRun['status']): string {
	if (status === 'failed') {
		return 'red'
	}

	return status === 'ready' ? 'green' : 'blue'
}

function RunProgress ({ run }: { run: OnboardingRun }) {
	const { percent, label } = onboardingProgress(run)
	const running = run.status === 'discovering' || run.status === 'verifying'

	return (
		<Group gap="sm" wrap="nowrap">
			<Progress
				aria-label="Onboarding progress"
				className="min-w-0 flex-1"
				size="md"
				value={percent}
				color={progressColor(run.status)}
				striped={running}
				animated={running}
			/>
			<Text size="xs" c="dimmed" className="shrink-0">
				{label}
			</Text>
		</Group>
	)
}

function countLabel (count: number, noun: string): string {
	return count === 1 ? `1 ${noun}` : `${count} ${noun}s`
}

// Collapsed: what discovery guessed is worth a look once, not on every visit.
function Assumptions ({ assumptions }: { assumptions: OnboardingAssumption[] }) {
	const [opened, { toggle }] = useDisclosure(false)

	if (assumptions.length === 0) {
		return null
	}

	return (
		<Stack gap={6}>
			<Anchor component="button" type="button" size="sm" className="self-start" onClick={toggle}>
				{countLabel(assumptions.length, 'assumption')} — {opened ? 'hide' : 'review'}
			</Anchor>
			<Collapse expanded={opened}>
				<Stack gap="xs">
					{assumptions.map((assumption) => (
						<Stack key={`${assumption.text}:${assumption.evidence}`} gap={0}>
							<Text size="sm">{assumption.text}</Text>
							<Text size="xs" c="dimmed" className="font-mono break-all">
								{assumption.evidence}
							</Text>
						</Stack>
					))}
				</Stack>
			</Collapse>
		</Stack>
	)
}

// The tab has to say something before there is a run: an empty panel reads as a
// page that failed to load.
function NoRun ({ machine }: { machine: Machine }) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm" align="start">
				<Text fw={600}>Onboarding</Text>
				<Text size="sm" c="dimmed">
					Not started. A session reads the repository and comes back with a config and the inputs this
					machine needs; verify starts on its own once they are in.
				</Text>
				<StartOnboardingButton machine={machine} phase="discover" />
			</Stack>
		</Card>
	)
}

export function OnboardingReport ({ machine }: { machine: Machine }) {
	const onboarding = useMachineOnboardingQuery({
		machineId: machine.id,
		enabled: machine.repositoryId != null
	})
	const repositories = useRepositoriesQuery()

	if (onboarding.isLoading) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (onboarding.data == null) {
		return <NoRun machine={machine} />
	}

	const { run, missing } = onboarding.data
	const repository = repositories.data?.find((entry) => entry.id === run.repositoryId) ?? null
	const steps = displaySteps(run)
	const pending = pendingStep(run, steps)

	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="md">
				<Stack gap="xs">
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

					<RunProgress run={run} />
				</Stack>

				{steps.length === 0 && pending === null ? null : <OnboardingSteps steps={steps} pending={pending} />}

				{run.failureReason === null ? null : (
					<Alert color="red" variant="light" title="The run failed">
						<Text size="sm" className="break-words whitespace-pre-wrap">
							{run.failureReason}
						</Text>
					</Alert>
				)}

				{missing.length === 0 ? null : (
					<Alert color="yellow" variant="light" title={`${countLabel(missing.length, 'input')} missing`}>
						<Anchor component={Link} to="?tab=inputs" replace size="sm">
							Fill them in on Inputs
						</Anchor>
					</Alert>
				)}

				<Assumptions assumptions={run.assumptions} />

				<ReportActions machine={machine} run={run} repository={repository} />
			</Stack>
		</Card>
	)
}
