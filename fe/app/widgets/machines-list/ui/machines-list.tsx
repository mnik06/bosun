import { Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

import { useMachinesQuery, type Machine } from '~/entities/machine'
import { QueryErrorAlert, SectionLoader } from '~/shared/ui'
import { MachineCard } from '~/widgets/machines-list/ui/machine-card'

export function MachinesList ({ renderBadge }: { renderBadge?: (machine: Machine) => ReactNode }) {
	const { data, isPending, error } = useMachinesQuery()

	if (isPending) {
		return <SectionLoader />
	}

	if (error) {
		return <QueryErrorAlert title="Could not load machines" error={error} />
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
				<MachineCard key={machine.id} machine={machine} badge={renderBadge?.(machine)} />
			))}
		</Stack>
	)
}
