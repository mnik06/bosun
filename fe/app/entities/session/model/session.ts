export interface Session {
	userId: string
	email: string
}

export type SessionState =
	| { status: 'loading', session: null }
	| { status: 'anonymous', session: null }
	| { status: 'authenticated', session: Session }
