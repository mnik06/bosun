import { describe, expect, it } from 'vitest';
import {
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
