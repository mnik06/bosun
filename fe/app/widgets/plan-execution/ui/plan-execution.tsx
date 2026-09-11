import { Alert, Anchor, Badge, Group, Loader, Spoiler, Stack, Text, ThemeIcon } from '@mantine/core'
import { Check, Circle, Loader as LoaderIcon, X } from 'lucide-react'

import type { PlanExecution, PlanRun } from '~/entities/plan'
import { RetryVerifyButton } from '~/features/retry-verify'
import { formatRelativeTime } from '~/shared/lib'
import { ChangeMap } from '~/widgets/plan-execution/ui/change-map'

const RUN_ICON: Record<PlanRun['status'], { color: string, icon: React.ReactNode }> = {
	pending: { color: 'gray', icon: <Circle size={11} /> },
	running: { color: 'blue', icon: <LoaderIcon size={11} color="white" /> },
	done: { color: 'green', icon: <Check size={11} /> },
	failed: { color: 'red', icon: <X size={11} /> }
}

function RunRow ({ run }: { run: PlanRun }) {
	const { color, icon } = RUN_ICON[run.status]

	return (
		<Group gap="xs" align="start" wrap="nowrap">
			<ThemeIcon color={color} size={18} radius="xl" mt={2}>
				{icon}
			</ThemeIcon>

			<div className="min-w-0">
				<Text size="sm">
					{run.ordinal}. {run.sliceTitle}
					{run.sliceKind === 'verify' ? (
						<Text component="span" size="xs" c="dimmed">
							{' '}
							· verify
						</Text>
					) : null}
				</Text>

				{run.status === 'running' && run.activity != null ? (
					<Text size="xs" c="dimmed">
						{run.activity}
					</Text>
				) : null}

				{run.commitSha === null ? null : (
					<Text size="xs" c="dimmed" className="font-mono">
						{run.commitSha.slice(0, 8)}
					</Text>
				)}

				{run.failureReason === null ? null : (
					<Text size="xs" c="red">
						{run.failureReason}
					</Text>
				)}

				{/* The session's own account of what it did. On a failed gate it is the
				    only thing that says why, so it is open rather than behind a click. */}
				{run.report == null ? null : (
					<Spoiler
						maxHeight={run.status === 'failed' ? 240 : 0}
						showLabel="Show what the session reported"
						hideLabel="Hide"
						styles={{ control: { fontSize: 'var(--mantine-font-size-xs)' } }}
					>
						<Text size="xs" c="dimmed" className="whitespace-pre-wrap">
							{run.report}
						</Text>
					</Spoiler>
				)}
			</div>
		</Group>
	)
}

export function PlanExecutionPanel ({
	execution,
	summary,
	summarisedAt
}: {
	execution: PlanExecution | null
	summary: React.ComponentProps<typeof ChangeMap>['summary'] | null
	summarisedAt: string | null
}) {
	if (execution === null) {
		return (
			<Text size="sm" c="dimmed">
				Nothing has run yet. Push this plan to a queue and its bullets appear here as they go.
			</Text>
		)
	}

	const finished = execution.item.status === 'done'

	return (
		<Stack gap="lg">
			{summary === null ? (
				<Text size="sm" c="dimmed">
					{finished
						? 'The change map is being written — it lands a few minutes after the branch does.'
						: 'The change map is written once every bullet has landed.'}
				</Text>
			) : (
				<Stack gap="xs">
					<Group justify="space-between" align="center">
						<Text size="xs" c="dimmed">
							What changed
						</Text>
						{summarisedAt === null ? null : (
							<Text size="xs" c="dimmed">
								{formatRelativeTime(summarisedAt)}
							</Text>
						)}
					</Group>
					<ChangeMap summary={summary} />
				</Stack>
			)}

			{execution.item.failureReason === null ? null : (
				<Alert color="red" variant="light">
					{execution.item.failureReason}
				</Alert>
			)}

			<Stack gap="xs">
				<Group gap="xs">
					<Text size="xs" c="dimmed">
						Run
					</Text>
					<Badge size="xs" variant="light">
						{execution.item.status}
					</Badge>
					{execution.item.status === 'running' ? <Loader size={12} /> : null}

					<div className="ml-auto">
						<RetryVerifyButton
							queueId={execution.queueId}
							itemId={execution.item.id}
							runs={execution.runs}
						/>
					</div>
				</Group>

				{execution.runs.map((run) => (
					<RunRow key={run.id} run={run} />
				))}
			</Stack>

			<Stack gap={4}>
				<Text size="xs" c="dimmed">
					queue · {execution.queueName}
				</Text>
				{execution.item.branch === null ? null : (
					<Text size="xs" c="dimmed" className="font-mono break-all">
						{execution.item.branch}
					</Text>
				)}
				{execution.item.prUrl === null ? null : (
					<Anchor href={execution.item.prUrl} target="_blank" rel="noreferrer" size="xs">
						Open the pull request
					</Anchor>
				)}
			</Stack>
		</Stack>
	)
}
