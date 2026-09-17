import type { QueryClient } from '@tanstack/react-query'

import { notificationKeys } from '~/entities/notification/api/notification.queries'
import { refetchQuery } from '~/shared/lib'

export function refreshNotifications (queryClient: QueryClient): void {
	refetchQuery(queryClient, notificationKeys.all())
}
