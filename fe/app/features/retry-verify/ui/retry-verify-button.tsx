import { Button, Tooltip } from '@mantine/core'
import { ScanEye } from 'lucide-react'

import { useRetryVerify } from '~/features/retry-verify/api/use-retry-verify'

const SETTLED = new Set(['done', 'failed'])

export function RetryVerifyButton ({
	queueId,
	itemId,
	runs
}: {
	queueId: string,
	itemId: string,
	runs: { status: string, sliceKind: string }[]
}) {
	const retry = useRetryVerify({ queueId, itemId })
	const verify = runs.find((run) => run.sliceKind === 'verify')
	// One worktree holds one session, so nothing is re-armed while a bullet is in
	// flight. The backend refuses the same thing rather than trusting this.
	const busy = runs.some((run) => run.status === 'running')

	if (verify === undefined || !SETTLED.has(verify.status) || busy) {
		return null
	}

	return (
		<Tooltip
			multiline
			w={280}
			label="Runs the verify bullet again on the branch as it stands. The build bullets keep their commits, and the pull request picks up the new verdict."
		>
			<Button
				variant="light"
				size="xs"
				leftSection={<ScanEye size={14} />}
				loading={retry.isPending}
				onClick={() => {
					retry.mutate()
				}}
			>
				Verify again
			</Button>
		</Tooltip>
	)
}
