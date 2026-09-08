import { Button, Tooltip } from '@mantine/core'
import { RotateCcw } from 'lucide-react'

import type { QueueItemDetail } from '~/entities/queue'
import { useRetryPlan } from '~/features/retry-plan/api/use-retry-plan'

const RETRYABLE = new Set(['failed', 'cancelled'])

export function RetryPlanButton ({ item }: { item: QueueItemDetail }) {
	const retry = useRetryPlan({ queueId: item.queueId, itemId: item.id })
	// A plan closed with bullets that never ran is not finished, whatever the badge
	// says, and retry is the only way to pick them up.
	const stranded = item.status === 'done' && item.runs.some((run) => run.status !== 'done')

	if (!RETRYABLE.has(item.status) && !stranded) {
		return null
	}

	const landed = item.runs.filter((run) => run.status === 'done').length
	const plural = landed === 1 ? '' : 's'
	const label =
		landed === 0
			? 'Runs this plan again from its first bullet, on the branch it already has.'
			: `Keeps the ${landed} bullet${plural} that landed and their commits, and runs the rest again on the same branch.`

	return (
		<Tooltip multiline w={280} label={label}>
			<Button
				variant="light"
				size="xs"
				leftSection={<RotateCcw size={14} />}
				loading={retry.isPending}
				onClick={() => {
					retry.mutate()
				}}
			>
				Retry
			</Button>
		</Tooltip>
	)
}
