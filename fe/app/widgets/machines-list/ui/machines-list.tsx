import { Alert, Center, Loader, Stack, Text } from '@mantine/core'

import { useMachinesQuery } from '~/entities/machine'
import { toErrorMessage } from '~/shared/lib'
import { MachineCard } from '~/widgets/machines-list/ui/machine-card'

export function MachinesList () {
	const { data, isPending, error } = useMachinesQuery()

	if (isPending) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		)
	}

	if (error) {
		return (
			<Alert color="red" title="Could not load machines">
				{toErrorMessage(error, 'Unknown error')}
			</Alert>
		)
	}

	if (data.length === 0) {
		return (
			<Text c="dimmed" size="sm">
				No machines yet. Add one to get an enrollment command.
			</Text>
		)
	}

	return (
		<Stack gap="sm">
			{data.map((machine) => (
				<MachineCard key={machine.id} machine={machine} />
			))}
		</Stack>
	)
}
