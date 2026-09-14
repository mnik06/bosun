import { Anchor } from '@mantine/core'
import { Link } from 'react-router'

import { Page } from '~/shared/ui'
import { MachineDetail } from '~/widgets/machine-detail'
import { MachineInputs } from '~/widgets/machine-inputs'
import { OnboardingReport } from '~/widgets/onboarding-report'
import { RepositoryConfig } from '~/widgets/repository-config'
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
				renderSetup={(machine) => <SetupChecklist machine={machine} />}
				renderOnboarding={(machine) => <OnboardingReport machine={machine} />}
				renderInputs={(machine) => <MachineInputs machine={machine} />}
				renderConfig={(machine) => <RepositoryConfig machine={machine} />}
			/>
		</Page>
	)
}
