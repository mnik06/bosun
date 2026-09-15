import { Loader, Switch } from '@mantine/core'

import {
	isPushSupported,
	useDisablePushNotifications,
	useEnablePushNotifications,
	usePushSubscriptionStatus
} from '~/features/push-notifications/api/use-push-notifications'

export function PushNotificationsSwitch () {
	const status = usePushSubscriptionStatus()
	const enable = useEnablePushNotifications()
	const disable = useDisablePushNotifications()

	if (!isPushSupported()) {
		return (
			<Switch checked={false} disabled label="Not supported in this browser" />
		)
	}

	if (status.isPending) {
		return <Loader size="sm" />
	}

	return (
		<Switch
			checked={status.data ?? false}
			disabled={enable.isPending || disable.isPending}
			onChange={(event) => {
				if (event.currentTarget.checked) {
					enable.mutate()
				} else {
					disable.mutate()
				}
			}}
		/>
	)
}
