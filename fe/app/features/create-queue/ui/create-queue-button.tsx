import { Button, Modal, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { useCreateQueue } from '~/features/create-queue/api/use-create-queue'

function CreateQueueForm ({ machineId, onDone }: { machineId: string, onDone: () => void }) {
	const [name, setName] = useState('')
	const [afk, setAfk] = useState(false)
	const create = useCreateQueue(machineId)

	const submit = () => {
		create.mutate({ machineId, name: name.trim(), afk }, { onSuccess: onDone })
	}

	return (
		<Stack gap="md">
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
				disabled={name.trim() === ''}
			>
				Create queue
			</Button>
		</Stack>
	)
}

export function CreateQueueButton ({ machineId }: { machineId: string }) {
	const [opened, { open, close }] = useDisclosure(false)

	return (
		<>
			<Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={open}>
				New queue
			</Button>

			<Modal opened={opened} onClose={close} title="New queue" centered>
				<CreateQueueForm machineId={machineId} onDone={close} />
			</Modal>
		</>
	)
}
