import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactElement, type ReactNode } from 'react'

import { refreshNotifications } from '~/entities/notification/lib/notification-cache'
import { NotificationUiMsgSchema } from '~/entities/notification/model/notification-message'
import { subscribeToUiSocket } from '~/shared/api'

// The push already carries the full notification, but a refetch is what keeps
// the bell's merged badge and the board's per-plan counts consistent with each
// other rather than each maintaining its own patched copy of the same row.
export function NotificationsSocketProvider ({ children }: { children: ReactNode }): ReactElement {
	const queryClient = useQueryClient()

	useEffect(() => {
		return subscribeToUiSocket({
			onMessage: (raw) => {
				if (NotificationUiMsgSchema.safeParse(raw).success) {
					refreshNotifications(queryClient)
				}
			}
		})
	}, [queryClient])

	return <>{children}</>
}
