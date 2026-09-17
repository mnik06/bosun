import { Alert, Button, Select, Stack, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useEffect } from 'react'

import { machineKind, useMachinesQuery } from '~/entities/machine'
import { machinePickerLabel, useRepositoriesQuery } from '~/entities/repository'
import { useQuickFix } from '~/features/quick-fix/api/use-quick-fix'
import { QuickFixFormSchema, type QuickFixForm } from '~/features/quick-fix/model/quick-fix-form'
import { AppModal } from '~/shared/ui'

export function QuickFixModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const machines = useMachinesQuery()
	const repositories = useRepositoriesQuery()
	const quickFix = useQuickFix()

	const form = useForm<QuickFixForm>({
		mode: 'uncontrolled',
		initialValues: { machineId: '', description: '' },
		validate: zod4Resolver(QuickFixFormSchema)
	})

	// A quick fix ends in a pull request against the machine's attached repository,
	// so only a machine that already has one — unlike New plan, which also allows a
	// bare repoPath checkout — is worth offering here.
	const options = (machines.data ?? [])
		.filter((machine) => machine.status === 'online' && machineKind(machine) === 'repository')
		.map((machine) => ({
			value: machine.id,
			label: machinePickerLabel({ machine, repositories: repositories.data })
		}))
	const firstMachineId = options[0]?.value

	useEffect(() => {
		if (opened && firstMachineId !== undefined && form.getValues().machineId === '') {
			form.setFieldValue('machineId', firstMachineId)
		}
	}, [opened, firstMachineId, form])

	const close = () => {
		form.reset()
		onClose()
	}

	const submit = (values: QuickFixForm) => {
		quickFix.mutate(values, { onSuccess: close })
	}

	return (
		<AppModal opened={opened} onClose={close} title="Quick fix" size="lg">
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					{options.length === 0 ? (
						<Alert color="yellow" title="No machine is ready">
							A quick fix runs on an online machine with a repository already attached.
						</Alert>
					) : null}

					<Select
						label="Machine"
						placeholder="Pick an online machine"
						data={options}
						disabled={options.length === 0}
						data-autofocus
						key={form.key('machineId')}
						{...form.getInputProps('machineId')}
					/>

					<Textarea
						label="Bug"
						placeholder="Describe the bug — what's wrong and where"
						autosize
						minRows={4}
						maxRows={12}
						key={form.key('description')}
						{...form.getInputProps('description')}
					/>

					<Button
						type="submit"
						fullWidth
						loading={quickFix.isPending}
						disabled={options.length === 0}
					>
						Start quick fix
					</Button>
				</Stack>
			</form>
		</AppModal>
	)
}
