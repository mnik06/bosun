import { Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'

import { normalizeEnvPath } from '~/widgets/machine-inputs/lib/input-groups'

export function AddPathForm ({ existing, onAdd }: { existing: string[], onAdd: (path: string) => void }) {
	const [value, setValue] = useState('')
	const empty = value.trim() === ''
	const path = normalizeEnvPath(value)
	const taken = !empty && existing.includes(path)

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault()

				if (!empty && !taken) {
					onAdd(path)
					setValue('')
				}
			}}
		>
			<Stack gap="sm">
				<Text size="sm" c="dimmed">
					A folder inside the repository. Its variables are written into that folder&apos;s .env in every
					worktree before each bullet.
				</Text>
				<Group gap="xs" align="start">
					<TextInput
						aria-label="Folder"
						placeholder="be"
						className="w-64 max-w-full"
						classNames={{ input: 'font-mono' }}
						autoComplete="off"
						value={value}
						error={taken ? 'Already has a tab' : undefined}
						onChange={(event) => {
							setValue(event.currentTarget.value)
						}}
					/>
					<Button type="submit" disabled={empty || taken}>
						Add
					</Button>
				</Group>
			</Stack>
		</form>
	)
}
