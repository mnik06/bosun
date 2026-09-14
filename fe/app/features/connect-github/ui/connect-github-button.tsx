import { Button } from '@mantine/core'
import { GitBranchPlus } from 'lucide-react'

import { useConnectGithub } from '~/features/connect-github/api/use-connect-github'

export function ConnectGithubButton ({
	label = 'Connect GitHub',
	mode = 'install'
}: {
	label?: string,
	mode?: 'install' | 'import'
}) {
	const connect = useConnectGithub(mode)

	return (
		<Button
			variant={mode === 'install' ? 'light' : 'subtle'}
			size="xs"
			leftSection={mode === 'install' ? <GitBranchPlus size={14} /> : null}
			loading={connect.isPending}
			onClick={() => {
				connect.mutate()
			}}
		>
			{label}
		</Button>
	)
}
