import { Button, Group, Stack, Textarea } from '@mantine/core'
import { useState } from 'react'

export function PasteEnvPanel ({
	onAdd,
	onCancel
}: {
	onAdd: (text: string) => boolean,
	onCancel: () => void
}) {
	const [text, setText] = useState('')

	return (
		<Stack gap="xs">
			<Textarea
				aria-label="Paste a .env file"
				placeholder={'DATABASE_URL=postgres://…\nSUPABASE_KEY=…'}
				autosize
				minRows={4}
				maxRows={12}
				spellCheck={false}
				autoComplete="off"
				classNames={{ input: 'font-mono' }}
				value={text}
				onChange={(event) => {
					setText(event.currentTarget.value)
				}}
			/>

			<Group gap="xs" justify="flex-end">
				<Button variant="default" size="xs" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					size="xs"
					disabled={text.trim() === ''}
					onClick={() => {
						if (onAdd(text)) {
							setText('')
						}
					}}
				>
					Add variables
				</Button>
			</Group>
		</Stack>
	)
}
