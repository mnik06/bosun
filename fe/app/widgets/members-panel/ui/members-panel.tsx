import { Alert, Button, Group, Loader, Stack, Table, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { UserPlus } from 'lucide-react'

import { useActiveProject, useProjectMembersQuery } from '~/entities/project'
import { MemberRoleSelect } from '~/features/change-member-role'
import { CreateMemberModal } from '~/features/create-member'
import { RemoveMemberButton } from '~/features/remove-member'

export function MembersPanel () {
	const { activeProject, isLeader } = useActiveProject()
	const { data: members, isPending, error } = useProjectMembersQuery(activeProject?.id ?? null)
	const [adding, { open, close }] = useDisclosure(false)

	if (activeProject === null) {
		return null
	}

	if (error) {
		return <Alert color="red">Could not load the members of this project.</Alert>
	}

	return (
		<Stack gap="md">
			<Group justify="space-between">
				<Text size="sm" c="dimmed">
					Leaders manage machines. Developers plan and execute on them.
				</Text>

				{isLeader ? <Button leftSection={<UserPlus size={16} />} onClick={open}>
						Add member
				</Button> : null}
			</Group>

			{isPending ? (
				<Loader size="sm" />
			) : (
				<Table highlightOnHover>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>Email</Table.Th>
							<Table.Th w={160}>Role</Table.Th>
							<Table.Th w={60} />
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{members.map((member) => (
							<Table.Tr key={member.userId}>
								<Table.Td>{member.email}</Table.Td>
								<Table.Td>
									{isLeader ? (
										<MemberRoleSelect projectId={activeProject.id} member={member} />
									) : (
										<Text size="sm">{member.role}</Text>
									)}
								</Table.Td>
								<Table.Td>
									{isLeader ? <RemoveMemberButton projectId={activeProject.id} member={member} /> : null}
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}

			<CreateMemberModal projectId={activeProject.id} opened={adding} onClose={close} />
		</Stack>
	)
}
