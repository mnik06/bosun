import { Button, Group, Stack, Textarea } from '@mantine/core'
import { useState } from 'react'

import { useSaveInstructions } from '~/features/edit-instructions/api/use-save-instructions'

const MAX_LENGTH = 10_000

const PLACEHOLDER = 'How to work in this repository, in your own words — e.g. Generate migrations with pnpm db:migrations:generate. Start the local database with pnpm db:up (docker). Run pnpm preflight before calling anything done.'

export function InstructionsEditor ({
	repositoryId,
	initialText
}: {
	repositoryId: string,
	initialText: string
}) {
	const [text, setText] = useState(initialText)
	const save = useSaveInstructions(repositoryId)
	const changed = text.trim() !== initialText.trim()

	return (
		<Stack gap="sm">
			<Textarea
				aria-label="Project instructions"
				description="Commands and conventions every session should follow. Never secrets, never which database."
				placeholder={PLACEHOLDER}
				autosize
				minRows={8}
				maxRows={30}
				maxLength={MAX_LENGTH}
				value={text}
				onChange={(event) => {
					setText(event.currentTarget.value)
				}}
			/>

			<Group justify="flex-end" gap="sm">
				<Button
					variant="default"
					size="xs"
					disabled={!changed}
					onClick={() => {
						setText(initialText)
						save.reset()
					}}
				>
						Discard changes
				</Button>
				<Button
					size="xs"
					loading={save.isPending}
					disabled={!changed}
					onClick={() => {
						save.mutate(text)
					}}
				>
						Save
				</Button>
			</Group>
		</Stack>
	)
}
