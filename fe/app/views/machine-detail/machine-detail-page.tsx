import { Anchor, Container, Stack } from '@mantine/core'
import { Link } from 'react-router'

import { MachineDetail } from '~/widgets/machine-detail'

import type { Route } from './+types/machine-detail-page'

export default function MachineDetailPage ({ params }: Route.ComponentProps) {
	return (
		<Container size="md" py="xl">
			<Stack gap="lg">
				<Anchor component={Link} to="/" size="sm">
					← Machines
				</Anchor>

				<MachineDetail machineId={params.machineId} />
			</Stack>
		</Container>
	)
}
