import { Button } from '@mantine/core'
import { GitBranchPlus } from 'lucide-react'
import { useState } from 'react'

import { ConnectAzureModal } from '~/features/connect-azure/ui/connect-azure-modal'

export function ConnectAzureButton ({ label = 'Connect an organization' }: { label?: string }) {
	const [opened, setOpened] = useState(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<GitBranchPlus size={14} />} onClick={() => { setOpened(true) }}>
				{label}
			</Button>
			<ConnectAzureModal opened={opened} onClose={() => { setOpened(false) }} />
		</>
	)
}
