import { Card, Stack, Text } from '@mantine/core'

import { CopyableCommand } from './copyable-command'

export function SetupStepCard ({
	title,
	detail,
	command,
	label = 'Run on the machine'
}: {
	title: string,
	detail: string,
	command: string,
	label?: string
}) {
	return (
		<Card withBorder padding="md" radius="md">
			<Stack gap="sm">
				<Stack gap={4}>
					<Text fw={600}>{title}</Text>
					<Text size="sm" c="dimmed">
						{detail}
					</Text>
				</Stack>

				<CopyableCommand label={label} command={command} />
			</Stack>
		</Card>
	)
}
