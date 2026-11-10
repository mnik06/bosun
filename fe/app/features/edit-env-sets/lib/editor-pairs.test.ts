import { describe, expect, it } from 'vitest'

import { editorPairs } from './editor-pairs'

let next = 0
const newId = () => `id-${++next}`

function requirement (key: string) {
	return { key, why: 'why', evidence: 'be/.env.example', missing: false, optional: false }
}

describe('editorPairs', () => {
	it('pins required keys first and lists stored-only keys after them once', () => {
		const pairs = editorPairs({
			required: [requirement('SUPABASE_URL'), requirement('DATABASE_URL'), requirement('SUPABASE_URL')],
			storedKeys: ['SENTRY_DSN', 'DATABASE_URL'],
			newId
		})

		expect(pairs.map(({ key, stored, required }) => ({ key, stored, required }))).toEqual([
			{ key: 'SUPABASE_URL', stored: false, required: true },
			{ key: 'DATABASE_URL', stored: true, required: true },
			{ key: 'SENTRY_DSN', stored: true, required: false }
		])
		expect(new Set(pairs.map((pair) => pair.id)).size).toBe(3)
	})
	// The badge is what tells an operator a value is bosun's to refresh, not theirs.
	it('marks the keys bosun filled, whether pinned or only stored', () => {
		const pairs = editorPairs({
			required: [requirement('STRIPE_KEY'), requirement('SUPABASE_URL')],
			storedKeys: ['SUPABASE_URL', 'SESSION_SECRET', 'DATABASE_URL'],
			autoKeys: ['SUPABASE_URL', 'SESSION_SECRET'],
			newId
		})

		expect(pairs.map(({ key, auto }) => ({ key, auto }))).toEqual([
			{ key: 'STRIPE_KEY', auto: false },
			{ key: 'SUPABASE_URL', auto: true },
			{ key: 'SESSION_SECRET', auto: true },
			{ key: 'DATABASE_URL', auto: false }
		])
	})
})
