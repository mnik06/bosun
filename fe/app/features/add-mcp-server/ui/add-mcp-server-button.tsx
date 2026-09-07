import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Plug } from 'lucide-react'

import { AddMcpServerModal } from '~/features/add-mcp-server/ui/add-mcp-server-modal'

export function AddMcpServerButton ({ machineName }: { machineName: string }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<Plug size={14} />} onClick={open}>
				Add MCP server
			</Button>

			<AddMcpServerModal machineName={machineName} opened={opened} onClose={close} />
		</>
	)
}
