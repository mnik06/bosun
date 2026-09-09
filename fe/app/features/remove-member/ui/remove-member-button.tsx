import { ActionIcon, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Trash2 } from 'lucide-react'

import type { ProjectMember } from '~/entities/project'
import { useRemoveMember } from '~/features/remove-member/api/use-remove-member'

export function RemoveMemberButton (props: { projectId: string, member: ProjectMember }) {
	const removeMember = useRemoveMember(props.projectId)

	const confirm = () => {
		modals.openConfirmModal({
			title: 'Remove member',
			centered: true,
			children: `${props.member.email} loses access to this project immediately, including any open tab.`,
			labels: { confirm: 'Remove', cancel: 'Cancel' },
			confirmProps: { color: 'red' },
			onConfirm: () => {
				removeMember.mutate(props.member.userId)
			}
		})
	}

	return (
		<Tooltip label="Remove from project">
			<ActionIcon
				variant="subtle"
				color="red"
				loading={removeMember.isPending}
				onClick={confirm}
			>
				<Trash2 size={16} />
			</ActionIcon>
		</Tooltip>
	)
}
