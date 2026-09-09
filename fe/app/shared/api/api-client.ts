import axios, { isAxiosError } from 'axios'

import { getActiveProjectId } from './active-project'
import { supabase } from './supabase'

export const apiClient = axios.create({
	baseURL: import.meta.env.VITE_API_URL,
	headers: { 'content-type': 'application/json' }
})

apiClient.interceptors.request.use(async (config) => {
	// getSession refreshes an expired token before handing it back, so a request
	// made across the expiry boundary carries the new one rather than failing.
	const { data } = await supabase.auth.getSession()

	if (data.session) {
		config.headers.set('Authorization', `Bearer ${data.session.access_token}`)
	}

	// Every resource route is scoped by this header. It is set here, beside the
	// token, so no call site can forget it — the backend answers 400 rather than
	// guessing which project a request meant.
	const projectId = getActiveProjectId()

	if (projectId !== null) {
		config.headers.set('X-Project-Id', projectId)
	}

	return config
})

apiClient.interceptors.response.use(undefined, async (error: unknown) => {
	// A 401 means the backend asked Supabase and was told this token belongs to
	// nobody — a deleted or revoked account. The stored session is a lie, and
	// clearing it locally is what flips the app back to the login screen.
	if (isAxiosError(error) && error.response?.status === 401) {
		await supabase.auth.signOut({ scope: 'local' })
	}

	throw error
})
