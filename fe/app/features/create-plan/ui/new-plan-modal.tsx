import { Alert, Button, Modal, Select, Stack, Switch, Textarea } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useNavigate } from 'react-router'

import { useMachinesQuery } from '~/entities/machine'
import { useCreatePlan } from '~/features/create-plan/api/use-create-plan'
import {
	CreatePlanFormSchema,
	type CreatePlanForm
} from '~/features/create-plan/model/create-plan'

export function NewPlanModal ({ opened, onClose }: { opened: boolean, onClose: () => void }) {
	const navigate = useNavigate()
	const machines = useMachinesQuery()
	const createPlan = useCreatePlan()

	const form = useForm<CreatePlanForm>({
		mode: 'uncontrolled',
		initialValues: { machineId: '', input: '', verifyInUi: true },
		validate: zod4Resolver(CreatePlanFormSchema)
	})

	// Only online machines: a session runs in that machine's checkout, so an
	// offline one has nothing to run the grill on and the backend refuses it.
	const options = (machines.data ?? [])
		.filter((machine) => machine.status === 'online')
		.map((machine) => ({ value: machine.id, label: machine.name }))

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
		<Modal opened={opened} onClose={close} title="New plan" centered size="lg">
			<form onSubmit={form.onSubmit(submit)}>
				<Stack gap="md">
					{options.length === 0 ? (
						<Alert color="yellow" title="No machine is online">
							A planning session runs inside a machine&apos;s checkout. Bring one online first.
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

					<Button type="submit" loading={createPlan.isPending} disabled={options.length === 0}>
						Start grilling
					</Button>
				</Stack>
			</form>
		</Modal>
	)
}
