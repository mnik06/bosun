import { Button, Group, NumberInput, Stack, Switch } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { machineKeys, patchMachineCapacity, type Machine } from '~/entities/machine'
import { lineKeys } from '~/entities/plan'
import { notifyError } from '~/shared/lib'

// Memory decides how many plans build here and these only lower it — unless the
// budget is ignored, and then the counts are taken as given. A lane is one plan
// verifying at a time, and each one holds a drive's worth of memory back.
export function MachineCapacityForm ({ machine }: { machine: Pick<Machine, 'id' | 'verifyLanes' | 'buildCap' | 'ignoreMemoryBudget'> }) {
	const queryClient = useQueryClient()
	const [lanes, setLanes] = useState<number>(machine.verifyLanes ?? 1)
	const [cap, setCap] = useState<number | null>(machine.buildCap ?? null)
	const [ignoreMemory, setIgnoreMemory] = useState<boolean>(machine.ignoreMemoryBudget ?? false)
	const save = useMutation({
		mutationFn: async () => patchMachineCapacity({ machineId: machine.id, verifyLanes: lanes, buildCap: cap, ignoreMemoryBudget: ignoreMemory }),
		onSuccess: async (updated) => {
			queryClient.setQueryData(machineKeys.detail(updated.id), updated)
			await queryClient.invalidateQueries({ queryKey: lineKeys.all() })
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not change the capacity', error })
		}
	})
	const changed =
		lanes !== (machine.verifyLanes ?? 1) ||
		cap !== (machine.buildCap ?? null) ||
		ignoreMemory !== (machine.ignoreMemoryBudget ?? false)

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
					description={ignoreMemory ? 'Empty: memory still decides' : 'Empty: memory decides'}
					min={1}
					max={32}
					w={180}
					value={cap ?? ''}
					onChange={(value) => {
						setCap(typeof value === 'number' ? value : null)
					}}
				/>
			</Group>

			<Switch
				label="Ignore memory budget"
				description="Run up to the build cap and verify lanes even when memory is short. Sessions spill into swap instead of waiting, and every lane still shares this machine's one development database."
				checked={ignoreMemory}
				onChange={(event) => {
					setIgnoreMemory(event.currentTarget.checked)
				}}
			/>

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
