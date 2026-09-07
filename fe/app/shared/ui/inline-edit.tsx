import { ActionIcon, Button, Group, Stack, Textarea, TextInput } from '@mantine/core'
import { PencilIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface InlineEditProps {
	value: string
	label: string
	placeholder?: string
	multiline?: boolean
	saving: boolean
	children: ReactNode
	onSave: (next: string) => void
}

export function InlineEdit ({
	value,
	label,
	placeholder = '',
	multiline = false,
	saving,
	children,
	onSave
}: InlineEditProps) {
	const [draft, setDraft] = useState<string | null>(null)

	if (draft === null) {
		return (
			<Group gap="xs" align="start" wrap="nowrap">
				<div className="min-w-0 grow">{children}</div>
				<ActionIcon
					variant="subtle"
					color="gray"
					aria-label={`Edit ${label}`}
					onClick={() => {
						setDraft(value)
					}}
				>
					<PencilIcon size={16} />
				</ActionIcon>
			</Group>
		)
	}

	const change = (next: string) => {
		setDraft(next)
	}

	return (
		<Stack gap="xs">
			{multiline ? (
				<Textarea
					label={label}
					placeholder={placeholder}
					value={draft}
					autosize
					minRows={6}
					data-autofocus
					onChange={(event) => {
						change(event.currentTarget.value)
					}}
				/>
			) : (
				<TextInput
					label={label}
					placeholder={placeholder}
					value={draft}
					data-autofocus
					onChange={(event) => {
						change(event.currentTarget.value)
					}}
				/>
			)}

			<Group gap="xs" justify="end">
				<Button
					variant="subtle"
					size="compact-sm"
					onClick={() => {
						setDraft(null)
					}}
				>
					Cancel
				</Button>
				<Button
					size="compact-sm"
					loading={saving}
					disabled={draft.trim().length === 0 || draft === value}
					onClick={() => {
						onSave(draft)
						setDraft(null)
					}}
				>
					Save
				</Button>
			</Group>
		</Stack>
	)
}
