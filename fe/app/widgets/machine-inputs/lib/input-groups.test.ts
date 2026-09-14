import { describe, expect, it } from 'vitest'

import { inputGroups } from './input-groups'

const updatedAt = '2026-09-14T00:00:00.000Z'

describe('inputGroups', () => {
	it('gives every path one tab, required paths first, and counts what is still missing', () => {
		const groups = inputGroups({
			requirements: [
				{ kind: 'env', path: 'be/', key: 'DATABASE_URL', why: 'db', evidence: 'be/.env.example' },
				{ kind: 'env', path: 'be/', key: 'SUPABASE_URL', why: 'auth', evidence: 'be/src/env.ts' },
				{ kind: 'env', path: null, key: 'VITE_API_URL', why: 'api', evidence: '.env.example' },
				{ kind: 'secret', path: null, key: 'TEST_LEADER_EMAIL', why: 'sign in', evidence: 'fe/login' },
				{ kind: 'policy', path: null, key: 'applyMigrations', why: 'migrations', evidence: 'be/drizzle' }
			],
			missing: [
				{ kind: 'env', path: 'be/', key: 'SUPABASE_URL', why: 'auth', evidence: 'be/src/env.ts' },
				{ kind: 'secret', path: null, key: 'TEST_LEADER_EMAIL', why: 'sign in', evidence: 'fe/login' }
			],
			envSets: [
				{ path: 'fe', keys: ['SENTRY_DSN'], updatedAt },
				{ path: 'be', keys: ['DATABASE_URL'], updatedAt }
			],
			sessionSecrets: ['TEST_LEADER_PASSWORD'],
			addedPaths: ['/fe/', 'scripts']
		})

		expect(groups.envs.map(({ path, storedKeys, missing, updatedAt: at }) => ({ path, storedKeys, missing, at }))).toEqual([
			{ path: 'be', storedKeys: ['DATABASE_URL'], missing: 1, at: updatedAt },
			{ path: '.', storedKeys: [], missing: 0, at: null },
			{ path: 'fe', storedKeys: ['SENTRY_DSN'], missing: 0, at: updatedAt },
			{ path: 'scripts', storedKeys: [], missing: 0, at: null }
		])
		expect(groups.envs[0]?.required.map((entry) => [entry.key, entry.missing])).toEqual([
			['DATABASE_URL', false],
			['SUPABASE_URL', true]
		])
		expect(groups.secrets).toMatchObject({ storedKeys: ['TEST_LEADER_PASSWORD'], missing: 1 })
		expect(groups.policy).toEqual({ why: 'migrations', missing: false })
	})
})
