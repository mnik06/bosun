import { Select } from '@mantine/core'

import type { ProjectMember } from '~/entities/project'
import { useChangeMemberRole } from '~/features/change-member-role/api/use-change-member-role'

export function MemberRoleSelect (props: { projectId: string, member: ProjectMember }) {
	const changeRole = useChangeMemberRole(props.projectId)

	return (
		<Select
			size="xs"
			w={130}
			allowDeselect={false}
			disabled={changeRole.isPending}
			value={props.member.role}
			data={[
				{ value: 'leader', label: 'Leader' },
				{ value: 'developer', label: 'Developer' }
			]}
			onChange={(role) => {
				if (role !== null && role !== props.member.role) {
					changeRole.mutate({ userId: props.member.userId, role: role })
				}
			}}
		/>
	)
}
