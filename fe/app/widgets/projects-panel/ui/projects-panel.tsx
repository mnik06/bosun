import { Alert, Loader, Table, Text } from '@mantine/core'

import { useProjectsQuery } from '~/entities/project'
import { formatRelativeTime } from '~/shared/lib'

export function ProjectsPanel () {
	const { data: projects, isPending, error } = useProjectsQuery()

	if (error) {
		return <Alert color="red">Could not load projects.</Alert>
	}

	if (isPending) {
		return <Loader size="sm" />
	}

	const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name))

	return (
		<Table.ScrollContainer minWidth={480}>
			<Table highlightOnHover>
				<Table.Thead>
					<Table.Tr>
						<Table.Th>Name</Table.Th>
						<Table.Th w={160}>Created</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{sorted.map((project) => (
						<Table.Tr key={project.id}>
							<Table.Td>{project.name}</Table.Td>
							<Table.Td>
								<Text size="sm" c="dimmed">
									{formatRelativeTime(project.createdAt)}
								</Text>
							</Table.Td>
						</Table.Tr>
					))}
				</Table.Tbody>
			</Table>
		</Table.ScrollContainer>
	)
}
