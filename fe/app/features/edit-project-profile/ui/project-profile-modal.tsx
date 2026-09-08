import { Button, Modal, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'

import { DEFAULT_PROJECT_PROFILE, type Machine, type ProjectProfile } from '~/entities/machine'
import { useSaveProjectProfile } from '~/features/edit-project-profile/api/use-save-profile'

const AGENT_DECIDES = 'Leave it empty and the agent works it out from the repository itself.'

function trimmed (value: string): string | null {
	return value.trim() === '' ? null : value.trim()
}

function ProfileForm ({ machine, onDone }: { machine: Machine, onDone: () => void }) {
	const [draft, setDraft] = useState<ProjectProfile>(
		machine.projectProfile ?? DEFAULT_PROJECT_PROFILE
	)
	const save = useSaveProjectProfile(machine.id)

	const field = <K extends keyof ProjectProfile>(key: K, value: ProjectProfile[K]) => {
		setDraft((previous) => ({ ...previous, [key]: value }))
	}

	return (
		<Stack gap="md">
			<Text size="sm" c="dimmed">
				Only what a session cannot work out by reading the repository. The typecheck, the linter and
				the test command are discovered every run — leaving them out of here is deliberate, because
				a field that goes stale is worse than no field.
			</Text>

			<Stack gap="xs">
				<Switch
					label="Apply migrations during a run"
					description="Off when this machine points at a database bosun must not migrate. A session then commits the migration and says it is pending."
					checked={draft.applyMigrations}
					onChange={(event) => {
						field('applyMigrations', event.currentTarget.checked)
					}}
				/>

				{draft.applyMigrations ? (
					<TextInput
						label="Migration command"
						description={AGENT_DECIDES}
						placeholder="pnpm db:migration:run"
						value={draft.migrationCommand ?? ''}
						onChange={(event) => {
							field('migrationCommand', trimmed(event.currentTarget.value))
						}}
					/>
				) : null}
			</Stack>

			<TextInput
				label="Setup command"
				description={`Run once when a worktree is created, usually the install. ${AGENT_DECIDES}`}
				placeholder="pnpm install"
				value={draft.setupCommand ?? ''}
				onChange={(event) => {
					field('setupCommand', trimmed(event.currentTarget.value))
				}}
			/>

			<TextInput
				label="Start command"
				description={`How the dev stack runs. Each queue gets its own ten-port range and is told which. ${AGENT_DECIDES}`}
				placeholder="pnpm dev"
				value={draft.startCommand ?? ''}
				onChange={(event) => {
					field('startCommand', trimmed(event.currentTarget.value))
				}}
			/>

			<TextInput
				label="Test credentials path"
				description="The path to them, never the credentials themselves — those stay on the machine, and bosun holds a pointer."
				placeholder="test-files/creds.md"
				value={draft.testCredentialsPath ?? ''}
				onChange={(event) => {
					field('testCredentialsPath', trimmed(event.currentTarget.value))
				}}
			/>

			<Textarea
				label="Notes"
				description="Anything else a session should know that it could not find out by looking."
				autosize
				minRows={2}
				value={draft.notes ?? ''}
				onChange={(event) => {
					field('notes', trimmed(event.currentTarget.value))
				}}
			/>

			<Button
				loading={save.isPending}
				onClick={() => {
					save.mutate(draft, { onSuccess: onDone })
				}}
			>
				Save
			</Button>
		</Stack>
	)
}

export function ProjectProfileModal ({
	machine,
	opened,
	onClose
}: {
	machine: Machine,
	opened: boolean,
	onClose: () => void
}) {
	return (
		<Modal opened={opened} onClose={onClose} title="Project setup" centered size="lg">
			<ProfileForm machine={machine} onDone={onClose} />
		</Modal>
	)
}
