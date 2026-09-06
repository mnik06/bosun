import { useMutation } from '@tanstack/react-query'

import type { Credentials } from '~/features/auth/model/credentials'
import { supabase } from '~/shared/api'
import { notifyError } from '~/shared/lib'

export function useSignUp () {
	return useMutation({
		mutationFn: async (credentials: Credentials) => {
			const { data, error } = await supabase.auth.signUp(credentials)

			if (error) {
				throw error
			}

			// Supabase deliberately does not report a taken address as an error —
			// that would let anyone enumerate who has an account. It returns an
			// obfuscated user and no session instead, so the absent session is the
			// only signal that the address was already registered.
			if (!data.session) {
				throw new Error('That email is already registered. Log in instead.')
			}
		},
		onError: (error: unknown) => {
			notifyError({ title: 'Could not sign up', error })
		}
	})
}
