import { Group, Loader, Text, ThemeIcon } from '@mantine/core'
import { Check, Circle, X } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SliceRunDetail } from '~/entities/queue'

import type { SliceRunStatus } from '~/entities/queue'

const ICONS: Record<SliceRunStatus, { color: string, icon: ReactNode }> = {
	pending: { color: 'gray', icon: <Circle size={11} /> },
	running: { color: 'blue', icon: <Loader size={11} color="white" /> },
	done: { color: 'green', icon: <Check size={11} /> },
	failed: { color: 'red', icon: <X size={11} /> }
}

export function SliceRunRow ({
	run,
	activity
}: {
	run: SliceRunDetail,
	activity: string | null | undefined
}) {
	const { color, icon } = ICONS[run.status]

	return (
		<Group gap="xs" align="start" wrap="nowrap" pl="md">
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

				{run.status === 'running' && activity != null ? (
					<Text size="xs" c="dimmed">
						{activity}
					</Text>
				) : null}

				{run.failureReason === null ? null : (
					<Text size="xs" c="red">
						{run.failureReason}
					</Text>
				)}

				{run.commitSha === null ? null : (
					<Text size="xs" c="dimmed" className="font-mono">
						{run.commitSha.slice(0, 8)}
					</Text>
				)}
			</div>
		</Group>
	)
}
