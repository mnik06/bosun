import { Menu } from '@mantine/core'
import { Pause, Play } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { useSetMachinePaused } from '~/features/pause-machine/api/use-set-machine-paused'

export function PauseMenuItem ({ machine }: { machine: Machine }) {
	const setPaused = useSetMachinePaused(machine.id)
	const paused = machine.status === 'paused'

	return (
		<Menu.Item
			leftSection={paused ? <Play size={14} /> : <Pause size={14} />}
			disabled={setPaused.isPending}
			onClick={() => {
				setPaused.mutate(!paused)
			}}
		>
			{paused ? 'Resume machine' : 'Pause machine'}
		</Menu.Item>
	)
}
