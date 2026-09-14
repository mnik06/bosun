import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import type { EnvSetSummary, Machine } from '~/entities/machine'
import { EnvSetModal } from '~/features/edit-env-sets/ui/env-set-modal'
import { EnvSetRow } from '~/features/edit-env-sets/ui/env-set-row'

export function EnvSetsPanel ({ machine }: { machine: Machine }) {
	const [opened, { open, close }] = useDisclosure(false)
	const [editing, setEditing] = useState<EnvSetSummary | null>(null)
	const envSets = machine.envSets ?? []

	const openFor = (envSet: EnvSetSummary | null) => {
		setEditing(envSet)
		open()
	}

	return (
		<Stack gap="xs">
			<Group justify="space-between" align="center" gap="sm">
				<Text size="sm" fw={600}>
					Env variables
				</Text>

				<Button
					variant="light"
					size="xs"
					leftSection={<KeyRound size={14} />}
					onClick={() => {
						openFor(null)
					}}
				>
					Add env variables
				</Button>
			</Group>

			{envSets.length === 0 ? (
				<Text size="sm" c="dimmed">
					Secrets a run needs but the repository does not hold — a .env for a folder, written into
					every build worktree before each bullet.
				</Text>
			) : (
				envSets.map((envSet) => (
					<EnvSetRow
						key={envSet.path}
						machineId={machine.id}
						envSet={envSet}
						onEdit={() => {
							openFor(envSet)
						}}
					/>
				))
			)}

			<EnvSetModal machine={machine} envSet={editing} opened={opened} onClose={close} />
		</Stack>
	)
}
