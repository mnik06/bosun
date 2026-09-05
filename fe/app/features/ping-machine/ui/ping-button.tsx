import { Button, Group, Text } from '@mantine/core'

import { useLastPong } from '~/entities/machine'
import { usePingMachine } from '~/features/ping-machine/api/use-ping-machine'

export function PingButton ({ machineId }: { machineId: string }) {
	const ping = usePingMachine(machineId)
	const lastPong = useLastPong(machineId)

	return (
		<Group gap="sm">
			<Button
				variant="light"
				loading={ping.isPending}
				onClick={() => {
					ping.mutate()
				}}
			>
				Ping
			</Button>

			{lastPong === null ? null : (
				<Text size="sm" className="font-mono">
					pong · {lastPong.rttMs}ms
				</Text>
			)}
		</Group>
	)
}
