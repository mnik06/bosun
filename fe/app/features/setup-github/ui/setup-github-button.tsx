import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { GitPullRequest } from 'lucide-react'

import { SetupGithubModal } from '~/features/setup-github/ui/setup-github-modal'

export function SetupGithubButton ({ machineName }: { machineName: string }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<GitPullRequest size={14} />} onClick={open}>
				Set up GitHub
			</Button>

			<SetupGithubModal machineName={machineName} opened={opened} onClose={close} />
		</>
	)
}
