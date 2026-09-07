import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { KeyRound } from 'lucide-react'

import { SetupClaudeModal } from '~/features/setup-claude/ui/setup-claude-modal'

export function SetupClaudeButton ({ machineName }: { machineName: string }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<KeyRound size={14} />} onClick={open}>
				Set up Claude
			</Button>

			<SetupClaudeModal machineName={machineName} opened={opened} onClose={close} />
		</>
	)
}
