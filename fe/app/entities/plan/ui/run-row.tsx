import { Card, Group, Loader, Spoiler, Stack, Text, ThemeIcon } from '@mantine/core'
import { Check, Circle, MessageCircleQuestion, X } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SliceRun } from '~/entities/plan/model/build'
import { AnsweredQuestion } from '~/entities/plan/ui/answered-question'

const RUN_ICON: Record<SliceRun['status'], { color: string, icon: ReactNode }> = {
	pending: { color: 'gray', icon: <Circle size={11} /> },
	running: { color: 'blue', icon: <Loader size={11} color="white" /> },
	done: { color: 'green', icon: <Check size={11} /> },
	failed: { color: 'red', icon: <X size={11} /> }
}

const PHASE_TITLE: Record<NonNullable<SliceRun['phase']>, string> = {
	drive: 'Drive — every criterion through the running product',
	fix: 'Fix — review the branch and repair the findings',
	recheck: 'Re-check — drive the repaired criteria again'
}

function runTitle (run: SliceRun): string {
	return run.phase === null ? `${String(run.ordinal)}. ${run.sliceTitle}` : PHASE_TITLE[run.phase]
}

export function RunRow ({ run, activity }: { run: SliceRun, activity: string | undefined }) {
	const { color, icon } = RUN_ICON[run.status]
	const live = activity ?? run.activity

	return (
		<Group gap="xs" align="start" wrap="nowrap">
			<ThemeIcon color={color} size={18} radius="xl" mt={2}>
				{icon}
			</ThemeIcon>

			<Stack gap={2} className="min-w-0 grow">
				<Text size="sm">{runTitle(run)}</Text>

				{run.status === 'running' && live !== null ? (
					<Text size="xs" c="dimmed">
						{live}
					</Text>
				) : null}

				{run.question === null ? null : (
					<Group gap={4}>
						<MessageCircleQuestion size={12} className="text-[var(--mantine-color-orange-6)]" />
						<Text size="xs" c="orange">
							Asked a question — answer it above.
						</Text>
					</Group>
				)}

				{run.answer === null ? null : (
					<Card withBorder padding="xs" radius="md">
						<AnsweredQuestion questions={run.answer.questions} answers={run.answer.answers} />
					</Card>
				)}

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

				{/* The session's own account of what it did. On a failure it is the only
				    thing that says why, so it is open rather than behind a click. */}
				{run.report === null ? null : (
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
			</Stack>
		</Group>
	)
}
