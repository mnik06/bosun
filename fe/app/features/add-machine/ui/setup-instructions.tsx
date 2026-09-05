import { Alert, Button, Divider, Spoiler, Stack, Text } from '@mantine/core'

import type { CreatedMachine } from '~/features/add-machine/model/add-machine'
import { CopyableCommand } from '~/shared/ui'

export function SetupInstructions ({
	machine,
	onDone
}: {
	machine: CreatedMachine,
	onDone: () => void
}) {
	return (
		<Stack gap="md">
			<Text size="sm">
				SSH into <strong>{machine.name}</strong> and run this. It installs the agent, enrolls the
				machine and starts it.
			</Text>

			<CopyableCommand label="Install and connect" command={machine.installCommand} />

			<Alert color="yellow" variant="light" title="Single use">
				<Text size="sm">
					This code works once and expires at {new Date(machine.expiresAt).toLocaleTimeString()}.
					It is shown here and nowhere else.
				</Text>
			</Alert>

			<Divider />

			<Spoiler maxHeight={0} showLabel="Agent already installed?" hideLabel="Hide">
				<CopyableCommand label="Enroll an existing agent" command={machine.enrollCommand} />
			</Spoiler>

			<Button onClick={onDone}>Done</Button>
		</Stack>
	)
}
