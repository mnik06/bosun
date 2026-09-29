import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { MessageSquareText } from 'lucide-react'

import type { Machine } from '~/entities/machine'
import { MachinePromptsModal } from '~/features/edit-project-profile/ui/machine-prompts-modal'

export function MachinePromptsButton ({ machine }: { machine: Machine }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button
				variant="light"
				size="xs"
				leftSection={<MessageSquareText size={14} />}
				onClick={open}
			>
				Prompts
			</Button>

			<MachinePromptsModal machine={machine} opened={opened} onClose={close} />
		</>
	)
}
