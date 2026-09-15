import { Card, Group, Stack, Text } from '@mantine/core'

import { PushNotificationsSwitch } from '~/features/push-notifications'

export function NotificationSettings () {
	return (
		<Card withBorder padding="md" radius="md">
			<Group justify="space-between" align="center" gap="sm">
				<Stack gap={2} className="min-w-0">
					<Text fw={600}>Notifications</Text>
					<Text size="sm" c="dimmed">
						Get a browser notification on this device when a plan or onboarding run needs you.
					</Text>
				</Stack>

				<PushNotificationsSwitch />
			</Group>
		</Card>
	)
}
