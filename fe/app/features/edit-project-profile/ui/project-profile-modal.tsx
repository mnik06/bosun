import { Button, Modal, Stack, Switch, TagsInput, Text, Textarea, TextInput } from '@mantine/core'
import { useState } from 'react'

import { DEFAULT_PROJECT_PROFILE, type Machine, type ProjectProfile } from '~/entities/machine'
import { useSaveProjectProfile } from '~/features/edit-project-profile/api/use-save-profile'

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

			<Switch
				label="Apply migrations during a run"
				description="Off when this machine points at a database bosun must not migrate. A session then commits the migration and says it is pending."
				checked={draft.applyMigrations}
				onChange={(event) => {
					field('applyMigrations', event.currentTarget.checked)
				}}
			/>

			<Switch
				label="Drive the UI in verify bullets"
				description="Off for a project with no user-facing surface, so a verify bullet does not report the absence of a browser as a defect."
				checked={draft.runUiTest}
				onChange={(event) => {
					field('runUiTest', event.currentTarget.checked)
				}}
			/>

			<TagsInput
				label="Files to copy into a new worktree"
				description="Untracked files a fresh checkout lacks — .env and its neighbours. Copied from this machine's own checkout, the only place they exist."
				placeholder=".env"
				value={draft.copyFiles}
				onChange={(value) => {
					field('copyFiles', value)
				}}
			/>

			<TextInput
				label="Setup command"
				description="Run once when a worktree is created. Usually the install."
				placeholder="pnpm install"
				value={draft.setupCommand ?? ''}
				onChange={(event) => {
					field('setupCommand', trimmed(event.currentTarget.value))
				}}
			/>

			<TextInput
				label="Migration command"
				placeholder="pnpm db:migration:run"
				value={draft.migrationCommand ?? ''}
				onChange={(event) => {
					field('migrationCommand', trimmed(event.currentTarget.value))
				}}
			/>

			<TextInput
				label="Start command"
				description="How the dev stack runs. Each queue gets its own ten-port range and is told which."
				placeholder="pnpm dev"
				value={draft.startCommand ?? ''}
				onChange={(event) => {
					field('startCommand', trimmed(event.currentTarget.value))
				}}
			/>

			<TextInput
				label="App URL"
				description="Where it serves once started."
				placeholder="http://127.0.0.1:5173"
				value={draft.appUrl ?? ''}
				onChange={(event) => {
					field('appUrl', trimmed(event.currentTarget.value))
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
