import { Button, Group, NumberInput, Stack } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { machineKeys, patchMachineCapacity, type Machine } from '~/entities/machine'
import { lineKeys } from '~/entities/plan'
import { notifyError } from '~/shared/lib'

// Memory decides how many plans build here; these only lower it. A lane is one
// plan verifying at a time, and each one holds a drive's worth of memory back.
export function MachineCapacityForm ({ machine }: { machine: Pick<Machine, 'id' | 'verifyLanes' | 'buildCap'> }) {
	const queryClient = useQueryClient()
	const [lanes, setLanes] = useState<number>(machine.verifyLanes ?? 1)
	const [cap, setCap] = useState<number | null>(machine.buildCap ?? null)
	const save = useMutation({
		mutationFn: async () => patchMachineCapacity({ machineId: machine.id, verifyLanes: lanes, buildCap: cap }),
		onSuccess: async (updated) => {
			queryClient.setQueryData(machineKeys.detail(updated.id), updated)
			await queryClient.invalidateQueries({ queryKey: lineKeys.all() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the capacity', error })
		}
	})
	const changed = lanes !== (machine.verifyLanes ?? 1) || cap !== (machine.buildCap ?? null)

	return (
		<Stack gap="sm">
			<Group gap="md" align="end" wrap="wrap">
				<NumberInput
					label="Verify lanes"
					description="Plans verifying at once"
					min={0}
					max={4}
					w={180}
					value={lanes}
					onChange={(value) => {
						setLanes(typeof value === 'number' ? value : 1)
					}}
				/>
				<NumberInput
					label="Build cap"
					description="Empty: memory decides"
					min={1}
					max={32}
					w={180}
					value={cap ?? ''}
					onChange={(value) => {
						setCap(typeof value === 'number' ? value : null)
					}}
				/>
			</Group>

			<Button
				size="xs"
				className="self-start"
				disabled={!changed}
				loading={save.isPending}
				onClick={() => {
					save.mutate()
				}}
			>
				Save capacity
			</Button>
		</Stack>
	)
}
