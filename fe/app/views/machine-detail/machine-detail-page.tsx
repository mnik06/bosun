import { Anchor } from '@mantine/core'
import { Link } from 'react-router'

import { Page } from '~/shared/ui'
import { MachineDetail } from '~/widgets/machine-detail'

import type { Route } from './+types/machine-detail-page'

export default function MachineDetailPage ({ params }: Route.ComponentProps) {
	return (
		<Page>
			<Anchor component={Link} to="/" size="sm">
				← Machines
			</Anchor>

			<MachineDetail machineId={params.machineId} />
		</Page>
	)
}
