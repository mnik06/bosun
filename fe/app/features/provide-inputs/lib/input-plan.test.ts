import { describe, expect, it } from 'vitest'

import { inputWrites, requiredInputs } from './input-plan'

const envSets = [{ path: 'be', keys: ['DATABASE_URL', 'SENTRY_DSN'], updatedAt: '2026-09-14T00:00:00.000Z' }]

describe('inputWrites', () => {
	it('carries every stored key of a path as null beside the ones typed', () => {
		const writes = inputWrites({
			draft: { env: { be: { SUPABASE_URL: 'https://x.supabase.co', DATABASE_URL: 'postgres://new' } }, secrets: {} },
			envSets,
			sessionSecrets: []
		})

		expect(writes.envSets).toEqual([
			{
				path: 'be',
				vars: [
					{ key: 'SENTRY_DSN', value: null },
					{ key: 'SUPABASE_URL', value: 'https://x.supabase.co' },
					{ key: 'DATABASE_URL', value: 'postgres://new' }
				]
			}
		])
	})

	it('writes nothing for a path or a secret list nobody typed into', () => {
		const writes = inputWrites({
			draft: { env: { be: { SUPABASE_URL: '' }, fe: {} }, secrets: { TEST_LEADER_EMAIL: '' } },
			envSets,
			sessionSecrets: ['TEST_LEADER_PASSWORD']
		})

		expect(writes).toEqual({ envSets: [], sessionSecrets: null })
	})

	it('keeps stored session secrets when one is added', () => {
		const writes = inputWrites({
			draft: { env: {}, secrets: { TEST_LEADER_EMAIL: 'lead@example.com' } },
			envSets: [],
			sessionSecrets: ['TEST_LEADER_PASSWORD', 'TEST_LEADER_EMAIL']
		})

		expect(writes.sessionSecrets).toEqual([
			{ key: 'TEST_LEADER_PASSWORD', value: null },
			{ key: 'TEST_LEADER_EMAIL', value: 'lead@example.com' }
		])
	})
})

describe('requiredInputs', () => {
	it('groups env keys by path and marks what the machine already holds', () => {
		const inputs = requiredInputs({
			requirements: [
				{ kind: 'env', path: 'be', key: 'DATABASE_URL', why: 'db', evidence: 'be/.env.example' },
				{ kind: 'env', path: 'be', key: 'SUPABASE_URL', why: 'auth', evidence: 'be/src/env.ts' },
				{ kind: 'secret', path: null, key: 'TEST_LEADER_EMAIL', why: 'sign in', evidence: 'fe/login' },
				{ kind: 'policy', path: null, key: 'applyMigrations', why: 'migrations', evidence: 'be/drizzle' }
			],
			missing: [
				{ kind: 'env', path: 'be', key: 'SUPABASE_URL', why: 'auth', evidence: 'be/src/env.ts' },
				{ kind: 'secret', path: null, key: 'TEST_LEADER_EMAIL', why: 'sign in', evidence: 'fe/login' }
			],
			envSets,
			sessionSecrets: []
		})

		expect(inputs.envPaths).toEqual([
			{
				path: 'be',
				keys: [
					{ key: 'DATABASE_URL', why: 'db', evidence: 'be/.env.example', stored: true, missing: false },
					{ key: 'SUPABASE_URL', why: 'auth', evidence: 'be/src/env.ts', stored: false, missing: true }
				]
			}
		])
		expect(inputs.secrets).toEqual([
			{ key: 'TEST_LEADER_EMAIL', why: 'sign in', evidence: 'fe/login', stored: false, missing: true }
		])
		expect(inputs.policy).toEqual({ why: 'migrations', evidence: 'be/drizzle', missing: false })
	})
})
