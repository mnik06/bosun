import { Button, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { useMachinesQuery } from '~/entities/machine'
import { useCreateQueue } from '~/features/create-queue/api/use-create-queue'
import { AppModal } from '~/shared/ui'

function CreateQueueForm ({
	machineId,
	onDone
}: {
	machineId: string | undefined,
	onDone: () => void
}) {
	const machines = useMachinesQuery()
	const [target, setTarget] = useState(machineId ?? '')
	const [name, setName] = useState('')
	const [afk, setAfk] = useState(false)
	const create = useCreateQueue()

	const submit = () => {
		create.mutate({ machineId: target, name: name.trim(), afk }, { onSuccess: onDone })
	}

	return (
		<Stack gap="md">
			{machineId === undefined ? (
				<Select
					label="Machine"
					placeholder="Pick a machine"
					description="The queue's worktree is made on it, out of the checkout it already has."
					data={(machines.data ?? []).map((machine) => ({
						value: machine.id,
						label: machine.name
					}))}
					value={target === '' ? null : target}
					onChange={(value) => { setTarget(value ?? '') }}
				/>
			) : null}

			<TextInput
				label="Name"
				placeholder="Auth work"
				description="Becomes a git worktree and a branch on the machine."
				value={name}
				maxLength={60}
				onChange={(event) => { setName(event.currentTarget.value) }}
			/>

			<Switch
				label="AFK"
				description="On, sessions never stop to ask — they decide alone. Off, a question pauses the queue until you answer it here."
				checked={afk}
				onChange={(event) => { setAfk(event.currentTarget.checked) }}
			/>

			<Text size="xs" c="dimmed">
				The worktree is created on the machine. If it is offline the queue waits, and the worktree
				is made when it reconnects.
			</Text>

			<Button
				onClick={submit}
				loading={create.isPending}
				disabled={name.trim() === '' || target === ''}
			>
				Create queue
			</Button>
		</Stack>
	)
}

export function CreateQueueButton ({ machineId }: { machineId?: string | undefined }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
				New queue
			</Button>

			<AppModal opened={opened} onClose={close} title="New queue" centered>
				<CreateQueueForm machineId={machineId} onDone={close} />
			</AppModal>
		</>
	)
}
