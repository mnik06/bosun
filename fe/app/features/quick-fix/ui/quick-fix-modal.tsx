import { Alert, Button, Stack, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'

import { machineKind, MachineSelectField, useOnlineMachineOptions } from '~/entities/machine'
import { machinePickerLabel, useRepositoriesQuery } from '~/entities/repository'
import { useQuickFix } from '~/features/quick-fix/api/use-quick-fix'
import { QuickFixFormSchema, type QuickFixForm } from '~/features/quick-fix/model/quick-fix-form'
import { AppModal } from '~/shared/ui'

export function QuickFixModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
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
	const { options } = useOnlineMachineOptions({
		filter: (machine) => machineKind(machine) === 'repository',
		label: (machine) => machinePickerLabel({ machine, repositories: repositories.data }),
		opened,
		machineId: form.getValues().machineId,
		onDefaultMachine: (machineId) => { form.setFieldValue('machineId', machineId) }
	})

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

					<MachineSelectField form={form} options={options} />

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
