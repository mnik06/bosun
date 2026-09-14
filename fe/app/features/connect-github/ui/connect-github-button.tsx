import { Button } from '@mantine/core'
import { GitBranchPlus } from 'lucide-react'

import { useConnectGithub } from '~/features/connect-github/api/use-connect-github'

export function ConnectGithubButton ({ label = 'Connect GitHub' }: { label?: string }) {
	const connect = useConnectGithub()

	return (
		<Button
			variant="light"
			size="xs"
			leftSection={<GitBranchPlus size={14} />}
			loading={connect.isPending}
			onClick={() => {
				connect.mutate()
			}}
		>
			{label}
		</Button>
	)
}
