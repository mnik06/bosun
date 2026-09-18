import { Badge, Group, Tooltip } from '@mantine/core'
import { useState } from 'react'

import type { GithubPatConnection } from '~/entities/repository'
import { DisconnectGithubPatMenuItem } from '~/features/connect-github-pat/ui/disconnect-github-pat-menu-item'
import { RotateGithubPatModal } from '~/features/connect-github-pat/ui/rotate-github-pat-modal'
import { ConnectionActionsMenu } from '~/shared/ui'

const KIND_LABEL = { fine_grained: 'fine-grained', classic: 'classic' } as const

export function GithubPatConnectionBadge ({ connection }: { connection: GithubPatConnection }) {
	const [rotating, setRotating] = useState(false)
	const broken = connection.status === 'broken'

	return (
		<Group gap={4} wrap="nowrap">
			<Tooltip label={broken ? `Broken — ${connection.lastError ?? 'replace the token'}` : `Personal token (${KIND_LABEL[connection.tokenType]})`}>
				<Badge {...(broken ? { color: 'red' } : {})} variant={broken ? 'filled' : 'default'} tt="none">
					{connection.githubLogin}
				</Badge>
			</Tooltip>

			<ConnectionActionsMenu
				ariaLabel={`${connection.githubLogin} token actions`}
				onRotate={() => { setRotating(true) }}
				disconnectItem={<DisconnectGithubPatMenuItem connection={connection} />}
			/>

			<RotateGithubPatModal connection={connection} opened={rotating} onClose={() => { setRotating(false) }} />
		</Group>
	)
}
