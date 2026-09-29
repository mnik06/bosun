import type { Machine } from '~/entities/machine'
import { MachinePromptsForm } from '~/features/edit-project-profile/ui/machine-prompts-form'
import { AppModal } from '~/shared/ui'

export function MachinePromptsModal ({
	machine,
	opened,
	onClose
}: {
	machine: Machine,
	opened: boolean,
	onClose: () => void
}) {
	return (
		<AppModal opened={opened} onClose={onClose} title="Prompts" centered size="lg">
			<MachinePromptsForm machine={machine} />
		</AppModal>
	)
}
