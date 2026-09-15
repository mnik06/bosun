import { ActionIcon, Indicator, Menu, Text } from '@mantine/core'
import { BellRing } from 'lucide-react'
import { Link } from 'react-router'

import { notificationPath, type Notification, useNotificationsQuery } from '~/entities/notification'
import { planLabel, useNeedsYouQuery, type NeedsYouItem } from '~/entities/plan'
import { useMarkNotificationRead } from '~/features/mark-notification-read'
import { formatRelativeTime } from '~/shared/lib'

const KIND_LABEL: Record<NeedsYouItem['kind'], string> = {
	question: 'Question',
	overlap: 'Overlap decision',
	integration: 'Sync failed',
	checks: 'Checks still red',
	provider_failed: 'The plan it needs failed',
	recheck_failed: 'Failed its re-check',
	worktree: 'Could not start'
}

function NotificationEntry ({ notification }: { notification: Notification }) {
	const markRead = useMarkNotificationRead()

	return (
		<Menu.Item
			component={Link}
			to={notificationPath(notification)}
			onClick={() => {
				markRead.mutate(notification.id)
			}}
		>
			<Text size="sm" fw={600} truncate>
				{notification.title}
			</Text>
			<Text size="xs" c="dimmed" lineClamp={2}>
				{notification.body}
			</Text>
			<Text size="xs" c="dimmed">
				{formatRelativeTime(notification.sentAt)}
			</Text>
		</Menu.Item>
	)
}

// Every decision lives on a plan page, so this is what brings a person to the one
// that is waiting — from whichever page they happen to be on. Unread notification
// log entries are a second, broader kind of "waiting on you" (an onboarding run,
// a machine gone offline) and share this menu rather than getting their own.
export function NeedsYouMenu () {
	const needsYou = useNeedsYouQuery()
	const notifications = useNotificationsQuery(true)
	const items = needsYou.data ?? []
	const unread = notifications.data ?? []
	const count = items.length + unread.length

	return (
		<Menu position="bottom-end" width={320} withArrow>
			<Menu.Target>
				<Indicator label={count} size={16} color="orange" disabled={count === 0}>
					<ActionIcon variant="subtle" size="lg" aria-label={`Needs you: ${String(count)}`}>
						<BellRing size={18} />
					</ActionIcon>
				</Indicator>
			</Menu.Target>

			<Menu.Dropdown>
				<Menu.Label>Needs you</Menu.Label>
				{items.length === 0 ? (
					<Text size="sm" c="dimmed" px="sm" py="xs">
						Nothing is waiting on anybody.
					</Text>
				) : (
					items.map((item) => (
						<Menu.Item
							key={`${item.planId}-${item.kind}`}
							component={Link}
							to={`/plans/${item.planId}`}
						>
							<Text size="sm" fw={600} truncate>
								{planLabel({ number: item.planNumber, title: item.planTitle })}
							</Text>
							<Text size="xs" c="dimmed" lineClamp={2}>
								{KIND_LABEL[item.kind]} — {item.detail}
							</Text>
						</Menu.Item>
					))
				)}

				{unread.length === 0 ? null : (
					<>
						<Menu.Label>Notifications</Menu.Label>
						{unread.map((notification) => (
							<NotificationEntry key={notification.id} notification={notification} />
						))}
					</>
				)}
			</Menu.Dropdown>
		</Menu>
	)
}
