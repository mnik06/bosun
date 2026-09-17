import { Alert, Button, Stack, Switch, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useNavigate } from 'react-router'

import { machineKind, MachineSelectField, useOnlineMachineOptions } from '~/entities/machine'
import { machinePickerLabel, useRepositoriesQuery } from '~/entities/repository'
import { useCreatePlan } from '~/features/create-plan/api/use-create-plan'
import {
	CreatePlanFormSchema,
	type CreatePlanForm
} from '~/features/create-plan/model/create-plan'
import { AppModal } from '~/shared/ui'

export function NewPlanModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const navigate = useNavigate()
	const repositories = useRepositoriesQuery()
	const createPlan = useCreatePlan()

	const form = useForm<CreatePlanForm>({
		mode: 'uncontrolled',
		initialValues: { machineId: '', input: '', verifyInUi: true, auto: false, afk: true },
		validate: zod4Resolver(CreatePlanFormSchema)
	})

	// Only online machines with something to read: a session runs in that
	// machine's checkout, and one enrolled with no repository attached has none.
	const { options } = useOnlineMachineOptions({
		filter: (machine) => machineKind(machine) !== 'unattached',
		label: (machine) => machinePickerLabel({ machine, repositories: repositories.data }),
		opened,
		machineId: form.getValues().machineId,
		onDefaultMachine: (machineId) => { form.setFieldValue('machineId', machineId) }
	})

	const close = () => {
		form.reset()
		onClose()
	}

	const submit = (values: CreatePlanForm) => {
		createPlan.mutate(values, {
			onSuccess: (plan) => {
				close()
				void navigate(`/plans/${plan.id}`)
			}
		})
	}

	return (
		<AppModal opened={opened} onClose={close} title="New plan" centered size="lg">
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					{options.length === 0 ? (
						<Alert color="yellow" title="No machine is online">
							A planning session runs inside a machine&apos;s checkout. Bring one online first.
						</Alert>
					) : null}

					<MachineSelectField form={form} options={options} />

					<Textarea
						label="Ticket"
						placeholder="Paste the ticket, the bug report, the half-formed idea…"
						autosize
						minRows={8}
						maxRows={20}
						key={form.key('input')}
						{...form.getInputProps('input')}
					/>

					<Switch
						label="Verify in the UI"
						description="On, the plan ends in a verify bullet that drives the finished feature through its interface and fixes what it finds. Off for work with no user-facing surface — no verify bullet is cut at all."
						key={form.key('verifyInUi')}
						{...form.getInputProps('verifyInUi', { type: 'checkbox' })}
					/>

					<Switch
						label="Auto-mode"
						description="Planning never waits for you: the grill answers each of its own questions with the option it recommended. Every question and answer still lands in the transcript."
						key={form.key('auto')}
						{...form.getInputProps('auto', { type: 'checkbox' })}
					/>

					<Switch
						label="AFK execution"
						description="Building never waits for you: bullets cannot ask a question, and the re-check after verify's fixes is skipped. Can be changed from the plan page; it applies from the next bullet."
						key={form.key('afk')}
						{...form.getInputProps('afk', { type: 'checkbox' })}
					/>

					<div className="sticky bottom-0 bg-[var(--mantine-color-body)] py-2">
						<Button type="submit" fullWidth loading={createPlan.isPending} disabled={options.length === 0}>
							Start grilling
						</Button>
					</div>
				</Stack>
			</form>
		</AppModal>
	)
}
