import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import {
	NotificationSchema,
	UnreadCountSchema,
	type Notification,
	type UnreadCount
} from '~/entities/notification/model/notification'
import { apiClient, getActiveProjectId } from '~/shared/api'

const NotificationListRespSchema = z.object({ notifications: z.array(NotificationSchema) })
const UnreadCountsRespSchema = z.object({ counts: z.array(UnreadCountSchema) })

export const notificationKeys = {
	all: () => ['notifications', getActiveProjectId()] as const,
	list: (unreadOnly: boolean) => [...notificationKeys.all(), 'list', unreadOnly] as const,
	unreadCounts: () => [...notificationKeys.all(), 'unread-counts'] as const
}

export async function fetchNotifications (unreadOnly: boolean): Promise<Notification[]> {
	const { data } = await apiClient.get<unknown>('/notifications', {
		params: unreadOnly ? { unread: 'true' } : undefined
	})

	return NotificationListRespSchema.parse(data).notifications
}

export async function fetchUnreadCounts (): Promise<UnreadCount[]> {
	const { data } = await apiClient.get<unknown>('/notifications/unread-counts')

	return UnreadCountsRespSchema.parse(data).counts
}

export function useNotificationsQuery (unreadOnly: boolean) {
	return useQuery({
		queryKey: notificationKeys.list(unreadOnly),
		queryFn: async () => fetchNotifications(unreadOnly)
	})
}

export function useUnreadCountsQuery () {
	return useQuery({ queryKey: notificationKeys.unreadCounts(), queryFn: fetchUnreadCounts })
}
