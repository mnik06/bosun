import { Button, Modal, Select, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useState } from 'react'

import type { CreatedMember } from '~/entities/project'
import { useCreateMember } from '~/features/create-member/api/use-create-member'
import {
	CreateMemberFormSchema,
	type CreateMemberForm
} from '~/features/create-member/model/create-member'
import { NewMemberCredentials } from '~/features/create-member/ui/new-member-credentials'

export function CreateMemberModal (props: {
	projectId: string
	opened: boolean
	onClose: () => void
}) {
	const [created, setCreated] = useState<CreatedMember | null>(null)
	const createMember = useCreateMember(props.projectId)

	const form = useForm<CreateMemberForm>({
		mode: 'uncontrolled',
		initialValues: { email: '', role: 'developer' },
		validate: zod4Resolver(CreateMemberFormSchema)
	})

	const close = () => {
		setCreated(null)
		form.reset()
		props.onClose()
	}

	const submit = (values: CreateMemberForm) => {
		createMember.mutate(values, { onSuccess: setCreated })
	}

	return (
		<Modal opened={props.opened} onClose={close} title="Add member" centered>
			{created === null ? (
				<form onSubmit={form.onSubmit(submit)}>
					<Stack gap="md">
						<TextInput
							label="Email"
							placeholder="teammate@example.com"
							data-autofocus
							key={form.key('email')}
							{...form.getInputProps('email')}
						/>
						<Select
							label="Role"
							allowDeselect={false}
							data={[
								{ value: 'developer', label: 'Developer — plan and execute' },
								{ value: 'leader', label: 'Leader — also manages machines' }
							]}
							key={form.key('role')}
							{...form.getInputProps('role')}
						/>
						<Button type="submit" loading={createMember.isPending}>
							Create
						</Button>
					</Stack>
				</form>
			) : (
				<NewMemberCredentials created={created} onDone={close} />
			)}
		</Modal>
	)
}
