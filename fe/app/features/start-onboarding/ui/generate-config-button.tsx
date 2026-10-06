import { Button, Tooltip } from '@mantine/core'
import { Sparkles } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { useStartOnboarding } from '~/features/start-onboarding/api/use-start-onboarding'
import { onboardingBlock } from '~/features/start-onboarding/lib/onboarding-block'
import { confirmAction } from '~/shared/lib'

// A discovery that only rewrites the config: the machine's onboarding, its inputs
// and its verify stay as they are.
export function GenerateConfigButton ({
	machine,
	hasConfig,
	running
}: {
	machine: Pick<Machine, 'id' | 'status' | 'repositoryId' | 'clonedRepositoryId' | 'capabilities'>,
	hasConfig: boolean,
	running: boolean
}) {
	const start = useStartOnboarding(machine.id)
	const blocked = running ? 'A config is already being generated.' : onboardingBlock(machine)
	const generate = () => {
		start.mutate('config')
	}

	return (
		<Tooltip label={blocked ?? ''} disabled={blocked === null} multiline w={240}>
			<Button
				variant="light"
				size="xs"
				leftSection={<Sparkles size={14} />}
				disabled={blocked !== null}
				loading={start.isPending || running}
				onClick={
					hasConfig
						? () => {
							confirmAction({
								title: 'Generate the config again?',
								body: 'A session on this machine reads the repository and publishes a new config, starting from the current one. It replaces the saved config for every machine on this repository; onboarding and verify are not re-run.',
								confirmLabel: 'Generate',
								cancelLabel: 'Keep it',
								color: 'blue',
								onConfirm: generate
							})
						}
						: generate
				}
			>
				{hasConfig ? 'Generate config again' : 'Generate config'}
			</Button>
		</Tooltip>
	)
}
