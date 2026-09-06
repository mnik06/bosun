import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSignOut () {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async () => {
			const { error } = await supabase.auth.signOut()

			if (error) {
				throw error
			}
		},
		// Everything cached was fetched for the account that just left. Clearing on
		// settle, not on success, keeps a failed sign-out from leaving its data
		// visible to whoever signs in next.
		onSettled: () => {
			queryClient.clear()
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not log out', error })
		}
	})
}
