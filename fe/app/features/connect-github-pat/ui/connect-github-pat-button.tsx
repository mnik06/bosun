import { Button } from '@mantine/core'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { ConnectGithubPatModal } from '~/features/connect-github-pat/ui/connect-github-pat-modal'

// Visually secondary to the App's own connect buttons (AC-58) — `variant="subtle"`
// beside their `variant="light"` (`ConnectGithubButton`), same size, lower weight.
export function ConnectGithubPatButton ({ label = 'Can\'t install the App? Connect with a token' }: { label?: string }) {
	const [opened, setOpened] = useState(false)

	return (
		<>
			<Button variant="subtle" size="xs" color="gray" leftSection={<KeyRound size={14} />} onClick={() => { setOpened(true) }}>
				{label}
			</Button>
			<ConnectGithubPatModal opened={opened} onClose={() => { setOpened(false) }} />
		</>
	)
}
