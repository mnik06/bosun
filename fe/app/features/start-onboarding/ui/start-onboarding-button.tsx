import { Button, Tooltip } from '@mantine/core'
import { Play, RotateCcw } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import type { OnboardingPhase } from '~/entities/repository'
import { useStartOnboarding } from '~/features/start-onboarding/api/use-start-onboarding'
import { onboardingBlock } from '~/features/start-onboarding/lib/onboarding-block'

const DEFAULT_LABELS: Record<OnboardingPhase, string> = {
	discover: 'Start onboarding',
	verify: 'Run verify'
}

export function StartOnboardingButton ({
	machine,
	phase,
	label,
	again = false
}: {
	machine: Pick<Machine, 'id' | 'status' | 'repositoryId' | 'capabilities'>,
	phase: OnboardingPhase,
	label?: string,
	again?: boolean
}) {
	const start = useStartOnboarding(machine.id)
	const blocked = onboardingBlock(machine)

	return (
		<Tooltip label={blocked ?? ''} disabled={blocked === null} multiline w={240}>
			<Button
				variant="light"
				size="xs"
				leftSection={again ? <RotateCcw size={14} /> : <Play size={14} />}
				disabled={blocked !== null}
				loading={start.isPending}
				onClick={() => {
					start.mutate(phase)
				}}
			>
				{label ?? DEFAULT_LABELS[phase]}
			</Button>
		</Tooltip>
	)
}
