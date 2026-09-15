import type { QueryClient } from '@tanstack/react-query'

import { notificationKeys } from '~/entities/notification/api/notification.queries'

export function refreshNotifications (queryClient: QueryClient): void {
	queryClient.invalidateQueries({ queryKey: notificationKeys.all() }).catch(() => {
		// A refetch that fails leaves the bell/badge as they were; the next push recovers.
	})
}
