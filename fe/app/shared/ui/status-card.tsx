import { Badge, Card, Group, Stack, Text } from '@mantine/core'

export interface StatusCardBadge {
	label: string
	color?: string
	variant?: 'outline' | 'light' | 'filled'
}

export function StatusCard ({ badges, body, note, footer }: {
	badges: StatusCardBadge[]
	body: string
	note?: string | null
	footer?: string | null
}) {
	return (
		<Card withBorder padding="sm" radius="md">
			<Stack gap={4}>
				<Group gap="xs">
					{badges.map((badge, index) => (
						<Badge key={index} size="xs" variant={badge.variant ?? 'light'} {...(badge.color === undefined ? {} : { color: badge.color })}>
							{badge.label}
						</Badge>
					))}
				</Group>
				<Text size="sm" className="whitespace-pre-wrap">
					{body}
				</Text>
				{note == null ? null : (
					<Text size="xs" c="dimmed" className="whitespace-pre-wrap">
						{note}
					</Text>
				)}
				{footer == null ? null : (
					<Text size="xs" c="orange">
						{footer}
					</Text>
				)}
			</Stack>
		</Card>
	)
}
