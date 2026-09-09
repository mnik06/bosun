import { Alert, Center, Loader, Tabs } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useQueueAnswer, useRunActivity } from '~/entities/machine'
import { queueElapsedMs, queueKeys, useQueueDetailQuery } from '~/entities/queue'
import { RunQuestionPanel } from '~/features/answer-run'
import { QueueChat } from '~/features/ask-queue'
import { EnqueuePlansModal } from '~/features/enqueue-plans'
import { apiClient } from '~/shared/api'
import { useNow } from '~/shared/hooks'
import { formatDuration, notifyError, toErrorMessage } from '~/shared/lib'
import { SplitPane } from '~/shared/ui'
import { QueueHeader } from '~/widgets/queue-detail/ui/queue-header'
import { QueueWork } from '~/widgets/queue-detail/ui/queue-work'

export function QueueDetail ({ queueId }: { queueId: string }) {
	const { data, isPending, error } = useQueueDetailQuery(queueId)
	const activity = useRunActivity()
	const streaming = useQueueAnswer(queueId)
	const queryClient = useQueryClient()
	const now = useNow()
	const [opened, { open, close }] = useDisclosure(false)
	const [tab, setTab] = useState<string | null>('work')
	// Read synchronously rather than in an effect: the two layouts are different
	// enough that settling into the right one a frame later reads as a glitch.
	const wide = useMediaQuery('(width >= 48em)', true, { getInitialValueInEffect: false })

	const runningRun = data?.items
		.flatMap((item) => item.runs)
		.find((run) => run.status === 'running')
	// Read off the run rather than out of the socket: the question is a row, so a
	// reload still finds the control that answers it.
	const asking = data?.items
		.flatMap((item) => item.runs)
		.find((run) => run.questionId !== null && run.question !== null)

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load queue">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	const remove = (itemId: string) => {
		apiClient
			.delete(`/queues/${queueId}/items/${itemId}`)
			.then(async () => queryClient.invalidateQueries({ queryKey: queueKeys.all() }))
			.catch((cause: unknown) => {
				notifyError({ title: 'Could not remove that plan', error: cause })
			})
	}

	const work = (
		<div className="min-h-0 grow overflow-y-auto pr-2">
			<QueueWork items={data.items} activity={activity} now={now} onRemove={remove} />
		</div>
	)

	const chat = (
		<div className="flex min-h-0 grow flex-col">
			<QueueChat queueId={queueId} messages={data.messages} streaming={streaming} />
		</div>
	)

	const active = tab === 'chat' ? 'chat' : 'work'

	// The page owns the viewport: the panes scroll, the page never does. Without
	// it the chat is the last child of a column of run cards, and reaching it
	// means scrolling past the whole queue.
	return (
		<div className="flex h-[var(--app-content-height)] min-h-0 flex-col gap-3 overflow-hidden">
			<QueueHeader
				queue={data.queue}
				running={runningRun !== undefined}
				subtitle={`${data.queue.worktreePath ?? 'no worktree yet'}${
					data.queue.baseRef === null ? '' : ` · from ${data.queue.baseRef}`
				} · ${formatDuration(queueElapsedMs({ items: data.items, now }))} of work`}
				onAddPlans={open}
			/>

			{data.queue.failureReason === null ? null : (
				<Alert color="red" variant="light" className="shrink-0">
					{data.queue.failureReason}
				</Alert>
			)}

			{/* Above the panes and never inside one: the queue is blocked on this,
			    and a tab away is a tab it can be missed on. Capped so a long list of
			    options cannot squeeze the panes to nothing. */}
			{asking?.questionId == null || asking.question === null ? null : (
				<div className="max-h-2/5 shrink-0 overflow-y-auto">
					<RunQuestionPanel
						runId={asking.id}
						questionId={asking.questionId}
						questions={asking.question}
					/>
				</div>
			)}

			{wide ? (
				<SplitPane
					initial={0.6}
					left={<div className="flex min-h-0 grow flex-col">{work}</div>}
					right={<div className="flex min-h-0 grow flex-col pl-2">{chat}</div>}
				/>
			) : (
				<Tabs value={active} onChange={setTab} className="flex min-h-0 grow flex-col">
					<Tabs.List mb="sm">
						<Tabs.Tab value="work">Work</Tabs.Tab>
						<Tabs.Tab value="chat">Chat</Tabs.Tab>
					</Tabs.List>

					{/* Rendered by hand rather than through Tabs.Panel: the panel is
					    hidden with a display rule, which fights the flex column the
					    scrolling panes are laid out in. */}
					{active === 'chat' ? chat : work}
				</Tabs>
			)}

			<EnqueuePlansModal queue={data.queue} opened={opened} onClose={close} />
		</div>
	)
}
