import { Alert, Group, Loader, Stack, Stepper, Text } from '@mantine/core'

import { RunRow, useIntegrationActivity, useRunActivity, type PlanDetail, type SliceRun } from '~/entities/plan'
import { BuildActionButton } from '~/features/control-build'
import { executionStep } from '~/widgets/plan-execution/lib/step'

// Build bullets in the order they build, then every verify session in the order it
// ran — a fix-again is a second fix, not a replacement of the first.
function orderedRuns (runs: SliceRun[]): SliceRun[] {
	const bullets = runs.filter((run) => run.phase === null).sort((a, b) => a.ordinal - b.ordinal)
	const phases = runs.filter((run) => run.phase !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

	return [...bullets, ...phases]
}

function IntegratingLine ({ detail }: { detail: PlanDetail }) {
	const activity = useIntegrationActivity()
	const running = detail.integrations.find((integration) => integration.status === 'running')

	return running === undefined ? null : (
		<Group gap="xs">
			<Loader size={12} />
			<Text size="sm" c="dimmed">
				Syncing with {running.onto}: {activity[running.id] ?? 'starting'}
			</Text>
		</Group>
	)
}

export function PlanExecution ({ detail }: { detail: PlanDetail }) {
	const activity = useRunActivity()
	const { build } = detail

	if (build === null) {
		return (
			<Text size="sm" c="dimmed">
				Nothing has run yet. Approve the plan and its bullets appear here as they build.
			</Text>
		)
	}

	const bullets = detail.runs.filter((run) => run.phase === null)
	const step = executionStep({
		status: build.status,
		bulletsDone: bullets.filter((run) => run.status === 'done').length,
		bulletsTotal: bullets.filter((run) => run.sliceKind === 'build').length,
		verifyStarted: detail.runs.some((run) => run.phase !== null && run.status !== 'pending')
	})

	return (
		<Stack gap="lg">
			<Stepper active={step} size="xs" allowNextStepsSelect={false}>
				<Stepper.Step label="Build" />
				<Stepper.Step label="Sync" />
				<Stepper.Step label="Verify" />
				<Stepper.Step label="Review" />
			</Stepper>

			{detail.reason === null ? null : (
				<Text size="sm" c="dimmed">
					{detail.reason}
				</Text>
			)}

			{build.failureReason === null ? null : (
				<Alert color={build.status === 'failed' ? 'red' : 'orange'} variant="light">
					<Stack gap="xs" align="start">
						<Text size="sm" className="whitespace-pre-wrap">
							{build.failureReason}
						</Text>
						{build.status === 'failed' ? <BuildActionButton buildId={build.id} control="retry" /> : null}
					</Stack>
				</Alert>
			)}

			<IntegratingLine detail={detail} />

			<Stack gap="sm">
				{orderedRuns(detail.runs).map((run) => (
					<RunRow key={run.id} run={run} activity={activity[run.id]} />
				))}
			</Stack>

			<Stack gap={2}>
				{build.branch === null ? null : (
					<Text size="xs" c="dimmed" className="font-mono break-all">
						{build.branch}
					</Text>
				)}
				{build.portBase === null ? null : (
					<Text size="xs" c="dimmed">
						ports {build.portBase}–{build.portBase + 9}
					</Text>
				)}
			</Stack>
		</Stack>
	)
}
