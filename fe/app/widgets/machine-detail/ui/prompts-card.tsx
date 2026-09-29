import type { Machine } from '~/entities/machine'
import { MachinePromptsButton } from '~/features/edit-project-profile'
import { SetupCard } from '~/widgets/machine-detail/ui/setup-card'

export function PromptsCard ({ machine }: { machine: Machine }) {
	return (
		<SetupCard
			title="Prompts"
			description="Standing instructions for this machine's Plan, Implement and Execute sessions."
			action={<MachinePromptsButton machine={machine} />}
		/>
	)
}
