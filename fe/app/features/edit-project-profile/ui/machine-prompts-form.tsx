import { Button, Stack, Tabs, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'

import { DEFAULT_PROJECT_PROFILE, type Machine, type ProjectProfile } from '~/entities/machine'
import { useSaveProjectProfile } from '~/features/edit-project-profile/api/use-save-profile'
import { trimmedOrNull, typed } from '~/shared/lib'

type PhaseField = 'planInstructions' | 'implementInstructions' | 'executeInstructions'

const PHASES: { field: PhaseField, label: string, description: string }[] = [
	{
		field: 'planInstructions',
		label: 'Plan',
		description: 'Reaches every planning session started on this machine — the plan and grill phase, before any code is written.'
	},
	{
		field: 'implementInstructions',
		label: 'Implement',
		description: 'Reaches every session that writes code on this machine: a build bullet, the verify lane\'s fix pass, a Bug-Fixing session and a Quick-Fix session.'
	},
	{
		field: 'executeInstructions',
		label: 'Execute',
		description: 'Reaches the verify lane that drives the running product — read-only, and never a session that writes code.'
	}
]

export function MachinePromptsForm ({ machine }: { machine: Machine }) {
	const initial = machine.projectProfile ?? DEFAULT_PROJECT_PROFILE
	const [draft, setDraft] = useState<ProjectProfile>(initial)
	const [saved, setSaved] = useState<ProjectProfile>(initial)
	const save = useSaveProjectProfile(machine.id)

	const dirty = PHASES.some(({ field }) => draft[field] !== saved[field])

	return (
		<Stack gap="md">
			<Tabs defaultValue="planInstructions" orientation="vertical" keepMounted>
				<Tabs.List>
					{PHASES.map((phase) => (
						<Tabs.Tab key={phase.field} value={phase.field}>
							{phase.label}
						</Tabs.Tab>
					))}
				</Tabs.List>

				{PHASES.map((phase) => (
					<Tabs.Panel key={phase.field} value={phase.field} pl="md">
						<Stack gap="xs">
							<Text size="sm" c="dimmed">
								{phase.description}
							</Text>
							<Textarea
								autosize
								minRows={8}
								value={draft[phase.field] ?? ''}
								onChange={(event) => {
									const { value } = event.currentTarget

									setDraft((previous) => ({ ...previous, [phase.field]: typed(value) }))
								}}
							/>
						</Stack>
					</Tabs.Panel>
				))}
			</Tabs>

			<Button
				disabled={!dirty}
				loading={save.isPending}
				onClick={() => {
					const trimmed: ProjectProfile = {
						...draft,
						planInstructions: trimmedOrNull(draft.planInstructions),
						implementInstructions: trimmedOrNull(draft.implementInstructions),
						executeInstructions: trimmedOrNull(draft.executeInstructions)
					}

					save.mutate(trimmed, {
						onSuccess: (updated) => {
							const next = updated.projectProfile ?? DEFAULT_PROJECT_PROFILE

							setDraft(next)
							setSaved(next)
							notifications.show({ color: 'green', title: 'Saved', message: 'The instructions were saved.' })
						}
					})
				}}
			>
				Save
			</Button>
		</Stack>
	)
}
