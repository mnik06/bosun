import { useMutation } from '@tanstack/react-query'

import type { Credentials } from '~/features/auth/model/credentials'
import { supabase } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSignIn () {
	return useMutation({
		mutationFn: async (credentials: Credentials) => {
			const { error } = await supabase.auth.signInWithPassword(credentials)

			if (error) {
				throw error
			}
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not log in', error })
		}
	})
}
