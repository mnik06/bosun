import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session as SupabaseSession } from '@supabase/supabase-js'

import type { SessionState } from '~/entities/session/model/session'
import { supabase } from '~/shared/api'

const SessionContext = createContext<SessionState>({ status: 'loading', session: null })

export function useSession (): SessionState {
	return useContext(SessionContext)
}

function toState (session: SupabaseSession | null): SessionState {
	if (!session) {
		return { status: 'anonymous', session: null }
	}

	return {
		status: 'authenticated',
		session: { userId: session.user.id, email: session.user.email ?? '' }
	}
}

export function SessionProvider ({ children }: { children: ReactNode }) {
	const [state, setState] = useState<SessionState>({ status: 'loading', session: null })

	useEffect(() => {
		// onAuthStateChange emits INITIAL_SESSION once the client has read storage,
		// so there is no getSession() call here to race the first real event.
		const { data } = supabase.auth.onAuthStateChange((_event, session) => {
			setState(toState(session))
		})

		return () => {
			data.subscription.unsubscribe()
		}
	}, [])

	return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}
