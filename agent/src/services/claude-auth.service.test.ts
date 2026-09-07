import { describe, expect, it } from 'vitest';
import { CLAUDE_TOKEN_VARIABLE, readClaudeAuthStatus } from './claude-auth.service';

describe('readClaudeAuthStatus', () => {
	it('reads a logged-in report', () => {
		const status = readClaudeAuthStatus({
			raw: '{"loggedIn":true}',
			tokenPresent: true
		});

		expect(status).toMatchObject({ reported: true, loggedIn: true });
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
