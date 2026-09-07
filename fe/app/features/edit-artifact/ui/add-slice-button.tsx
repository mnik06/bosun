import { Button, Group, TextInput } from '@mantine/core'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'

import { useEditArtifact } from '~/features/edit-artifact/api/use-edit-artifact'

// Splitting a bullet is adding an empty one and moving acceptance criteria into
// it with the picker on each row, so there is no separate split action.
export function AddSliceButton ({ planId }: { planId: string }) {
	const [title, setTitle] = useState<string | null>(null)
	const edit = useEditArtifact(planId)

	if (title === null) {
		return (
			<Button
				variant="subtle"
				size="compact-sm"
				leftSection={<PlusIcon size={14} />}
				onClick={() => {
					setTitle('')
				}}
			>
				Add tracer bullet
			</Button>
		)
	}

	return (
		<Group gap="xs" align="end">
			<TextInput
				label="Tracer bullet"
				placeholder="What this slice delivers"
				value={title}
				data-autofocus
				className="grow"
				onChange={(event) => {
					setTitle(event.currentTarget.value)
				}}
			/>
			<Button
				size="compact-sm"
				loading={edit.isPending}
				disabled={title.trim().length === 0}
				onClick={() => {
					edit.mutate({ kind: 'create-slice', title }, { onSuccess: () => { setTitle(null) } })
				}}
			>
				Add
			</Button>
			<Button
				variant="subtle"
				size="compact-sm"
				onClick={() => {
					setTitle(null)
				}}
			>
				Cancel
			</Button>
		</Group>
	)
}
