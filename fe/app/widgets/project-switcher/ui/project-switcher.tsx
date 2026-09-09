import { Button, Group, Menu, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Check, ChevronDown, Plus } from 'lucide-react'

import { useActiveProject } from '~/entities/project'
import { useMeQuery } from '~/entities/session'
import { CreateProjectModal } from '~/features/create-project'

export function ProjectSwitcher () {
	const { projects, activeProject, selectProject } = useActiveProject()
	const { data: me } = useMeQuery()
	const [creating, { open, close }] = useDisclosure(false)

	if (activeProject === null) {
		return null
	}

	return (
		<>
			<Menu position="bottom-start" width={260} withArrow>
				<Menu.Target>
					<Button variant="subtle" color="gray" size="compact-sm">
						<Group gap="xs" wrap="nowrap">
							<Text size="sm" fw={500} truncate maw={180}>
								{activeProject.name}
							</Text>
							<ChevronDown size={14} />
						</Group>
					</Button>
				</Menu.Target>

				<Menu.Dropdown>
					<Menu.Label>Projects</Menu.Label>
					{projects.map((project) => (
						<Menu.Item
							key={project.id}
							leftSection={project.id === activeProject.id ? <Check size={14} /> : null}
							onClick={() => {
								selectProject(project.id)
							}}
						>
							<Group justify="space-between" wrap="nowrap">
								<Text size="sm" truncate>
									{project.name}
								</Text>
								<Text size="xs" c="dimmed">
									{project.role}
								</Text>
							</Group>
						</Menu.Item>
					))}

					{me?.isAppOwner === true ? <>
						<Menu.Divider />
						<Menu.Item leftSection={<Plus size={14} />} onClick={open}>
								New project
						</Menu.Item>
					</> : null}
				</Menu.Dropdown>
			</Menu>

			<CreateProjectModal opened={creating} onClose={close} />
		</>
	)
}
