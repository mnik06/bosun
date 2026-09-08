import { Card, Group, Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'

export function SetupCard ({
	title,
	description,
	action
}: {
	title: string,
	description: string,
	action: ReactNode
}) {
	return (
		<Card withBorder padding="md" radius="md">
			<Group justify="space-between" align="center" wrap="nowrap">
				<Stack gap={2} className="min-w-0">
					<Text fw={600}>{title}</Text>
					<Text size="sm" c="dimmed">
						{description}
					</Text>
				</Stack>

				<div className="shrink-0">{action}</div>
			</Group>
		</Card>
	)
}
