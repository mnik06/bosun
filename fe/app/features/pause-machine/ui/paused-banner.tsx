import { Alert, Button, Group, Text } from '@mantine/core'

import type { Machine } from '~/entities/machine'
import { useSetMachinePaused } from '~/features/pause-machine/api/use-set-machine-paused'

export function PausedBanner ({ machine }: { machine: Machine }) {
	const setPaused = useSetMachinePaused(machine.id)

	if (machine.status !== 'paused') {
		return null
	}

	return (
		<Alert color="yellow" variant="light" title="Paused">
			<Group justify="space-between" align="center" wrap="nowrap">
				<Text size="sm">
					The agent is still connected, but bosun will not dispatch anything to this machine.
				</Text>
				<Button
					variant="light"
					color="yellow"
					size="compact-sm"
					loading={setPaused.isPending}
					onClick={() => {
						setPaused.mutate(false)
					}}
				>
					Resume
				</Button>
			</Group>
		</Alert>
	)
}
