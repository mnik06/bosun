import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '~/shared/api'
import { base64ToBytes, notifyError } from '~/shared/lib'

export const pushSubscriptionKeys = {
	status: () => ['push-subscription', 'status'] as const
}

export function isPushSupported (): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window
}

// `PushManager.subscribe` needs the VAPID public key as bytes, not the base64url
// string the env carries — the one shape the Push API itself does not accept, and
// the one difference from the plain base64 `base64ToBytes` otherwise decodes.
function applicationServerKey (base64Url: string): Uint8Array<ArrayBuffer> {
	const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=')

	return base64ToBytes(base64)
}

async function currentSubscription (): Promise<PushSubscription | null> {
	if (!isPushSupported()) {
		return null
	}

	const registration = await navigator.serviceWorker.ready

	return registration.pushManager.getSubscription()
}

export function usePushSubscriptionStatus () {
	return useQuery({
		queryKey: pushSubscriptionKeys.status(),
		queryFn: async (): Promise<boolean> => (await currentSubscription()) !== null
	})
}

export function useEnablePushNotifications () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (): Promise<void> => {
			if (!isPushSupported()) {
				throw new Error('This browser does not support push notifications')
			}

			if ((await Notification.requestPermission()) !== 'granted') {
				throw new Error('Notification permission was not granted')
			}

			const registration = await navigator.serviceWorker.ready
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: applicationServerKey(import.meta.env.VITE_VAPID_PUBLIC_KEY)
			})
			const json = subscription.toJSON()

			await apiClient.post('/push/subscriptions', {
				endpoint: json.endpoint,
				keys: { p256dh: json.keys?.['p256dh'], auth: json.keys?.['auth'] }
			})
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: pushSubscriptionKeys.status() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not turn on notifications', error })
		}
	})
}

export function useDisablePushNotifications () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (): Promise<void> => {
			const subscription = await currentSubscription()

			if (!subscription) {
				return
			}

			await apiClient.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } })
			await subscription.unsubscribe()
		},
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: pushSubscriptionKeys.status() }),
		onError: (error: unknown) => {
			notifyError({ title: 'Could not turn off notifications', error })
		}
	})
}
