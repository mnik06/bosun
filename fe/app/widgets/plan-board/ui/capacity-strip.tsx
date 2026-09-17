import { Group, Progress, Stack, Text } from '@mantine/core'

import { PLAN_STATE_LABEL, type MachineCapacity } from '~/entities/plan'
import { formatGib } from '~/shared/lib'

function laneText (capacity: MachineCapacity): string {
	const waiting = capacity.verifyWaiting > 0 ? ` · ${String(capacity.verifyWaiting)} waiting` : ''

	if (capacity.lane.length === 0) {
		return `${capacity.verifyLanes === 0 ? 'none' : 'free'}${waiting}`
	}

	const occupants = capacity.lane
		.map((occupant) => `#${String(occupant.planNumber)} ${occupant.status === 'rechecking' ? 're-checking' : PLAN_STATE_LABEL.verifying.label}`)
		.join(', ')

	return `${occupants}${waiting}`
}

function Memory ({ capacity }: { capacity: MachineCapacity }) {
	if (capacity.buildBytes === null) {
		return (
			<Text size="xs" c="dimmed">
				memory not reported
			</Text>
		)
	}

	const percent = capacity.buildBytes === 0 ? 0 : Math.min(100, (capacity.buildBytesInUse / capacity.buildBytes) * 100)

	return (
		<Group gap={6} wrap="nowrap">
			<Progress value={percent} w={96} size="sm" />
			<Text size="xs" c="dimmed" className="whitespace-nowrap">
				{formatGib(capacity.buildBytesInUse)} / {formatGib(capacity.buildBytes)}
			</Text>
		</Group>
	)
}

export function CapacityStrip ({ capacity }: { capacity: MachineCapacity[] }) {
	if (capacity.length === 0) {
		return null
	}

	return (
		<Stack gap={4}>
			{capacity.map((machine) => (
				<Group key={machine.machineId} gap="sm" wrap="wrap">
					<Text size="xs" fw={600} className="w-28 truncate">
						{machine.machineName}
					</Text>
					{machine.online ? (
						<>
							<Text size="xs" c="dimmed">
								build
							</Text>
							<Memory capacity={machine} />
							<Text size="xs" c="dimmed">
								{machine.buildsRunning}
								{machine.buildCap === null ? '' : ` / ${String(machine.buildCap)}`} building
							</Text>
							<Text size="xs" c="dimmed">
								verify lane: {laneText(machine)}
							</Text>
							{machine.ignoreMemoryBudget === true ? (
								<Text size="xs" c="yellow">
									memory budget ignored
								</Text>
							) : null}
						</>
					) : (
						<Text size="xs" c="dimmed">
							offline
						</Text>
					)}
				</Group>
			))}
		</Stack>
	)
}
