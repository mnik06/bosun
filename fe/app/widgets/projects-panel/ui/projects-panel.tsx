import { Alert, Button, Group, Loader, Stack, Table, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Plus } from 'lucide-react'

import { useProjectsQuery } from '~/entities/project'
import { CreateProjectModal } from '~/features/create-project'
import { DeleteProjectButton } from '~/features/delete-project'
import { RenameProjectField } from '~/features/rename-project'
import { formatRelativeTime } from '~/shared/lib'

export function ProjectsPanel () {
	const { data: projects, isPending, error } = useProjectsQuery()
	const [creating, { open, close }] = useDisclosure(false)

	if (error) {
		return <Alert color="red">Could not load projects.</Alert>
	}

	return (
		<Stack gap="md">
			<Group justify="end">
				<Button leftSection={<Plus size={16} />} onClick={open}>
					New project
				</Button>
			</Group>

			{isPending ? (
				<Loader size="sm" />
			) : (
				<Table.ScrollContainer minWidth={480}>
					<Table highlightOnHover>
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Name</Table.Th>
								<Table.Th w={160}>Created</Table.Th>
								<Table.Th w={60} />
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((project) => (
								<Table.Tr key={project.id}>
									<Table.Td>
										<RenameProjectField project={project} />
									</Table.Td>
									<Table.Td>
										<Text size="sm" c="dimmed">
											{formatRelativeTime(project.createdAt)}
										</Text>
									</Table.Td>
									<Table.Td>
										<DeleteProjectButton project={project} />
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				</Table.ScrollContainer>
			)}

			<CreateProjectModal opened={creating} onClose={close} />
		</Stack>
	)
}
