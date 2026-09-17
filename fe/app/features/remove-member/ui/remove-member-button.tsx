import { ActionIcon, Tooltip } from '@mantine/core'
import { Trash2 } from 'lucide-react'

import type { ProjectMember } from '~/entities/project'
import { useRemoveMember } from '~/features/remove-member/api/use-remove-member'
import { confirmAction } from '~/shared/lib'

export function RemoveMemberButton (props: { projectId: string, member: ProjectMember }) {
	const removeMember = useRemoveMember(props.projectId)

	const confirm = () => {
		confirmAction({
			title: 'Remove member',
			body: `${props.member.email} loses access to this project immediately, including any open tab.`,
			confirmLabel: 'Remove',
			color: 'red',
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
