import { Text } from '@mantine/core'

import { ProjectNameSchema, type Project } from '~/entities/project'
import { useRenameProject } from '~/features/rename-project/api/use-rename-project'
import { notifyError } from '~/shared/lib'
import { InlineEdit } from '~/shared/ui'

export function RenameProjectField ({ project }: { project: Project }) {
	const renameProject = useRenameProject(project.id)

	const save = (next: string) => {
		const result = ProjectNameSchema.safeParse(next)

		if (!result.success) {
			notifyError({ title: 'Could not rename project', error: result.error })

			return
		}

		renameProject.mutate(result.data)
	}

	return (
		<InlineEdit value={project.name} label="Name" saving={renameProject.isPending} onSave={save}>
			<Text size="sm" fw={500}>
				{project.name}
			</Text>
		</InlineEdit>
	)
}
