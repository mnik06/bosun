import { describe, expect, it } from 'vitest'

import { parseEnvText } from './parse-env-text'

describe('parseEnvText', () => {
	it('reads a pasted .env file into pairs, skipping blanks and comments', () => {
		const parsed = parseEnvText([
			'# database',
			'DATABASE_URL="postgresql://u:p@host:6543/postgres?pgbouncer=true"',
			'',
			'export SUPABASE_URL=https://x.supabase.co',
			'SWAGGER_PWD=\'12345#Qwerty\'',
			'TZ=UTC # the servers run in UTC'
		].join('\r\n'))

		expect(parsed).toEqual({
			vars: [
				{ key: 'DATABASE_URL', value: 'postgresql://u:p@host:6543/postgres?pgbouncer=true' },
				{ key: 'SUPABASE_URL', value: 'https://x.supabase.co' },
				{ key: 'SWAGGER_PWD', value: '12345#Qwerty' },
				{ key: 'TZ', value: 'UTC' }
			],
			skippedLines: []
		})
	})

	it('lets a later definition win, as dotenv does', () => {
		expect(parseEnvText('PORT=1\nPORT=2').vars).toEqual([{ key: 'PORT', value: '2' }])
	})

	it('keeps empty values and escaped quotes', () => {
		expect(parseEnvText('EMPTY=\nQUOTED="say \\"hi\\""').vars).toEqual([
			{ key: 'EMPTY', value: '' },
			{ key: 'QUOTED', value: 'say "hi"' }
		])
	})

	// Half of a multi-line value stored as the whole value is a secret that is
	// silently wrong, so these are reported instead.
	it('reports lines it cannot store rather than guessing', () => {
		const parsed = parseEnvText('GOOD=1\nPRIVATE_KEY="-----BEGIN\nnot a definition\n1BAD=x')

		expect(parsed.vars).toEqual([{ key: 'GOOD', value: '1' }])
		expect(parsed.skippedLines).toEqual([2, 3, 4])
	})
})
