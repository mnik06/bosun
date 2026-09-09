import { Button, Modal, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import { useCreateProject } from '~/features/create-project/api/use-create-project'
import {
	CreateProjectFormSchema,
	type CreateProjectForm
} from '~/features/create-project/model/create-project'

export function CreateProjectModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const createProject = useCreateProject()

	const form = useForm<CreateProjectForm>({
		mode: 'uncontrolled',
		initialValues: { name: '' },
		validate: zod4Resolver(CreateProjectFormSchema)
	})

	const close = () => {
		form.reset()
		onClose()
	}

	const submit = (values: CreateProjectForm) => {
		createProject.mutate(values, { onSuccess: close })
	}

	return (
		<Modal opened={opened} onClose={close} title="New project" centered>
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					<TextInput
						label="Name"
						placeholder="Acme"
						data-autofocus
						key={form.key('name')}
						{...form.getInputProps('name')}
					/>
					<Button type="submit" loading={createProject.isPending}>
						Create
					</Button>
				</Stack>
			</form>
		</Modal>
	)
}
