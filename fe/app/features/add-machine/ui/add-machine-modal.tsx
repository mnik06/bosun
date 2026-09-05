import { Button, Modal, Stack, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useState } from 'react'

import { useCreateMachine } from '~/features/add-machine/api/use-create-machine'
import {
	AddMachineFormSchema,
	type AddMachineForm,
	type CreatedMachine
} from '~/features/add-machine/model/add-machine'
import { SetupInstructions } from '~/features/add-machine/ui/setup-instructions'

export function AddMachineModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const [created, setCreated] = useState<CreatedMachine | null>(null)
	const createMachine = useCreateMachine()

	const form = useForm<AddMachineForm>({
		mode: 'uncontrolled',
		initialValues: { name: '' },
		validate: zod4Resolver(AddMachineFormSchema)
	})

	const close = () => {
		setCreated(null)
		form.reset()
		onClose()
	}

	const submit = (values: AddMachineForm) => {
		createMachine.mutate(values, { onSuccess: setCreated })
	}

	return (
		<Modal opened={opened} onClose={close} title="Add machine" centered>
			{created === null ? (
				<form onSubmit={form.onSubmit(submit)}>
					<Stack gap="md">
						<TextInput
							label="Name"
							placeholder="vps-1"
							data-autofocus
							key={form.key('name')}
							{...form.getInputProps('name')}
						/>
						<Button type="submit" loading={createMachine.isPending}>
							Create
						</Button>
					</Stack>
				</form>
			) : (
				<SetupInstructions machine={created} onDone={close} />
			)}
		</Modal>
	)
}
