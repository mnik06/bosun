import { Anchor, Stack } from '@mantine/core'
import { Link } from 'react-router'

import { Page } from '~/shared/ui'
import { MachineDetail } from '~/widgets/machine-detail'
import { OnboardingReport } from '~/widgets/onboarding-report'
import { SetupChecklist } from '~/widgets/setup-checklist'

import type { Route } from './+types/machine-detail-page'

export default function MachineDetailPage ({ params }: Route.ComponentProps) {
	return (
		<Page>
			<Anchor component={Link} to="/" size="sm">
				← Machines
			</Anchor>

			<MachineDetail
				machineId={params.machineId}
				renderSetup={(machine) => (
					<Stack gap="lg">
						<SetupChecklist machine={machine} />
						<OnboardingReport machine={machine} />
					</Stack>
				)}
			/>
		</Page>
	)
}
