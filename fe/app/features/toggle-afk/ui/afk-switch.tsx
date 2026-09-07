import { Switch, Tooltip } from '@mantine/core'

import type { Queue } from '~/entities/queue'
import { useToggleAfk } from '~/features/toggle-afk/api/use-toggle-afk'

export function AfkSwitch ({ queue }: { queue: Queue }) {
	const toggle = useToggleAfk(queue.id)

	return (
		<Tooltip
			multiline
			w={280}
			label="On, sessions decide alone and can never stop to ask. Off, a question pauses the queue until you answer. Takes effect on the next bullet — the one running already has its tools."
		>
			<Switch
				label="AFK"
				size="sm"
				checked={queue.afk}
				disabled={toggle.isPending}
				onChange={(event) => {
					toggle.mutate(event.currentTarget.checked)
				}}
			/>
		</Tooltip>
	)
}
