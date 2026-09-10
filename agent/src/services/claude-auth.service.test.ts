import { describe, expect, it } from 'vitest';
import {
	credentialEnv,
	describeToken,
	CLAUDE_TOKEN_VARIABLE,
	readClaudeAuthStatus,
	readVerifyResult
} from './claude-auth.service';

describe('readClaudeAuthStatus', () => {
	it('reads a logged-in report', () => {
		const status = readClaudeAuthStatus({
			raw: '{"loggedIn":true}',
			tokenPresent: true
		});

		expect(status).toMatchObject({ reported: true, loggedIn: true });
		// Not "authenticated": auth status proves a credential is configured, nothing more.
		expect(status.detail).toContain('credential present');
	});

	// The CLI prints a notice before its JSON often enough that assuming the object
	// starts at byte zero silently turns every check red.
	it('finds the object after a leading notice', () => {
		const status = readClaudeAuthStatus({
			raw: 'Some update notice\n{"loggedIn":true}',
			tokenPresent: true
		});

		expect(status.loggedIn).toBe(true);
	});

	// The distinction the whole check exists for: a box that looks configured and
	// still fails is where an operator otherwise stops looking.
	it('says the token was refused when one is present but rejected', () => {
		const status = readClaudeAuthStatus({
			raw: '{"loggedIn":false}',
			tokenPresent: true
		});

		expect(status).toMatchObject({ reported: true, loggedIn: false });
		expect(status.detail).toContain('may have expired');
	});

	it('says the token is missing when none is set', () => {
		const status = readClaudeAuthStatus({
			raw: '{"loggedIn":false}',
			tokenPresent: false
		});

		expect(status.detail).toContain(`no ${CLAUDE_TOKEN_VARIABLE}`);
		expect(status.detail).toContain('setup-token');
	});

	// "Not logged in" is an answer; "no answer" is a broken command, and the two
	// need different things done about them.
	it.each([['not json at all'], [''], ['{"loggedIn":"yes"}']])(
		'reports nothing readable for %j rather than claiming a verdict',
		(raw) => {
			const status = readClaudeAuthStatus({ raw, tokenPresent: true });

			expect(status).toMatchObject({ reported: false, loggedIn: false });
		}
	);
});

describe('readVerifyResult', () => {
	it('accepts a successful turn', () => {
		const result = readVerifyResult({ raw: '{"subtype":"success","result":"ok"}', reason: '' });

		expect(result.ok).toBe(true);
	});

	// The case the whole command exists for: `claude auth status` calls a bogus
	// token logged-in, so only a real turn can tell a good credential from a dead one.
	it('reports the API refusal verbatim', () => {
		const raw = JSON.stringify({
			is_error: true,
			api_error_status: 401,
			result: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.'
		});

		expect(readVerifyResult({ raw, reason: '' })).toEqual({
			ok: false,
			detail: 'Failed to authenticate. API Error: 401 OAuth access token is invalid.'
		});
	});

	it('falls back to the status code when there is no message', () => {
		const raw = JSON.stringify({ is_error: true, api_error_status: 500 });

		expect(readVerifyResult({ raw, reason: '' }).detail).toContain('500');
	});

	it('locates the object after a leading notice', () => {
		const result = readVerifyResult({ raw: 'update available\n{"subtype":"success"}', reason: '' });

		expect(result.ok).toBe(true);
	});

	// A command that never ran is not a credential verdict.
	it.each([
		['', 'claude: not found on the service PATH'],
		['not json', 'timed out after 60s']
	])('reports the exec failure when output is %j', (raw, reason) => {
		expect(readVerifyResult({ raw, reason })).toEqual({ ok: false, detail: reason });
	});
});

describe('readVerifyResult without a JSON result', () => {
	// The failure that sent an operator looking at their token when the problem was
	// their claude install: a clean exit, no JSON, and a message naming neither.
	it('quotes what claude printed instead of only saying it was unreadable', () => {
		const result = readVerifyResult({
			raw: 'Welcome to Claude Code!',
			reason: '',
			stderr: 'no stdin data received'
		});

		expect(result.ok).toBe(false);
		expect(result.detail).toContain('Welcome to Claude Code!');
		expect(result.detail).toContain('no stdin data received');
	});

	it('says so plainly when claude printed nothing at all', () => {
		const result = readVerifyResult({ raw: '', reason: '', stderr: '' });

		expect(result.detail).toContain('printed nothing at all');
		expect(result.detail).toContain('claude --version');
	});

	// A reason from exec is a diagnosis already; quoting output over it would bury
	// "not found on the service PATH" under an empty stdout.
	it('prefers the exec failure reason when there is one', () => {
		const result = readVerifyResult({
			raw: '',
			reason: 'not found on the service PATH',
			stderr: 'noise'
		});

		expect(result.detail).toBe('not found on the service PATH');
	});
});

describe('readVerifyResult against the shape claude actually emits', () => {
	// The real payload of a *successful* run: `api_error_status` is present and
	// null rather than absent. Under `optional()` that one field failed the whole
	// object, and a working credential was reported as unreadable output.
	const success = JSON.stringify({
		type: 'result',
		subtype: 'success',
		is_error: false,
		api_error_status: null,
		result: 'Ready.',
		duration_ms: 1366,
		usage: { input_tokens: 2 }
	});

	it('accepts a credential the API accepted', () => {
		expect(readVerifyResult({ raw: success, reason: '' })).toMatchObject({ ok: true });
	});

	it('still reports a refusal', () => {
		const refused = JSON.stringify({
			is_error: true,
			api_error_status: 401,
			result: 'Invalid API key'
		});

		expect(readVerifyResult({ raw: refused, reason: '' })).toMatchObject({
			ok: false,
			detail: 'Invalid API key'
		});
	});

	it('falls back to the status when a refusal carries no message', () => {
		const refused = JSON.stringify({ is_error: true, api_error_status: 403, result: null });

		expect(readVerifyResult({ raw: refused, reason: '' }).detail).toContain('403');
	});
});

describe('readClaudeAuthStatus against explicit nulls', () => {
	it('reads a logged-in report whose authMethod is null', () => {
		const status = readClaudeAuthStatus({
			raw: '{"loggedIn":true,"authMethod":null}',
			tokenPresent: true
		});

		expect(status).toMatchObject({ reported: true, loggedIn: true });
	});
});

describe('credentialEnv', () => {
	// The bug this exists for: a stale API key on the box outranks the token, and
	// the 401 that follows names the token — the one thing that was fine.
	it('strips a conflicting API key before a verify', () => {
		const env = credentialEnv({
			env: { ANTHROPIC_API_KEY: 'sk-ant-api03-stale', PATH: '/usr/bin' },
			token: 'sk-ant-oat01-good'
		});

		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(env[CLAUDE_TOKEN_VARIABLE]).toBe('sk-ant-oat01-good');
		expect(env.PATH).toBe('/usr/bin');
	});

	it('leaves the token in the environment alone when none is passed', () => {
		const env = credentialEnv({ env: { [CLAUDE_TOKEN_VARIABLE]: 'sk-ant-oat01-stored' } });

		expect(env[CLAUDE_TOKEN_VARIABLE]).toBe('sk-ant-oat01-stored');
	});

	it('does not mutate the environment it was given', () => {
		const original = { ANTHROPIC_API_KEY: 'sk-ant-api03-stale' };

		credentialEnv({ env: original });

		expect(original.ANTHROPIC_API_KEY).toBe('sk-ant-api03-stale');
	});
});

describe('describeToken', () => {
	const token = `sk-ant-oat01-${'a'.repeat(80)}zzzz`;

	it('quotes the prefix and the tail, never the middle', () => {
		const described = describeToken(token);

		expect(described.warning).toBeNull();
		expect(described.fingerprint).toContain(`${token.length} characters`);
		expect(described.fingerprint).toContain('sk-ant-oat01-');
		expect(described.fingerprint).toContain('zzzz');
		expect(described.fingerprint).not.toContain('aaaaaaaa');
	});

	// A short value is mostly prefix and tail, so quoting both would print it whole.
	it('reports a short value by length alone', () => {
		expect(describeToken('sk-ant-oat01-ab').fingerprint).toBe('15 characters');
	});

	it('names an API key as an API key rather than leaving it to the API', () => {
		const described = describeToken(`sk-ant-api03-${'a'.repeat(80)}`);

		expect(described.warning).toContain('sk-ant-oat01-');
	});

	// What a wrapped terminal line looks like once it has been copied.
	it('flags whitespace picked up by the paste', () => {
		const described = describeToken(`sk-ant-oat01-${'a'.repeat(40)} ${'b'.repeat(40)}`);

		expect(described.warning).toContain('line break');
	});
});
