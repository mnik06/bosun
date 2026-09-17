import { ActionIcon, Badge, Group, Menu, Tooltip } from '@mantine/core'
import { EllipsisVertical, KeyRound } from 'lucide-react'
import { useState } from 'react'

import type { GithubPatConnection } from '~/entities/repository'
import { DisconnectGithubPatMenuItem } from '~/features/connect-github-pat/ui/disconnect-github-pat-menu-item'
import { RotateGithubPatModal } from '~/features/connect-github-pat/ui/rotate-github-pat-modal'

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

			<Menu position="bottom-end" withinPortal>
				<Menu.Target>
					<ActionIcon variant="subtle" color="gray" size="sm" aria-label={`${connection.githubLogin} token actions`}>
						<EllipsisVertical size={12} />
					</ActionIcon>
				</Menu.Target>

				<Menu.Dropdown>
					<Menu.Item leftSection={<KeyRound size={14} />} onClick={() => { setRotating(true) }}>
						Replace token
					</Menu.Item>

					<Menu.Divider />

					<DisconnectGithubPatMenuItem connection={connection} />
				</Menu.Dropdown>
			</Menu>

			<RotateGithubPatModal connection={connection} opened={rotating} onClose={() => { setRotating(false) }} />
		</Group>
	)
}
