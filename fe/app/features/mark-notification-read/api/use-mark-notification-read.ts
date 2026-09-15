import { useMutation, useQueryClient } from '@tanstack/react-query'

import { refreshNotifications } from '~/entities/notification'
import { apiClient } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useMarkNotificationRead () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (notificationId: string) => {
			await apiClient.post(`/notifications/${notificationId}/read`)
		},
		onSuccess: () => {
			refreshNotifications(queryClient)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not mark notification read', error })
		}
	})
}

export function useMarkPlanNotificationsRead () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (planId: string) => {
			await apiClient.post('/notifications/read-for-plan', { planId })
		},
		onSuccess: () => {
			refreshNotifications(queryClient)
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not clear notifications for this plan', error })
		}
	})
}
