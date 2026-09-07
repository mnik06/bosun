import { describe, expect, it } from 'vitest';
import { buildSecrets, credentialVariables, encodeBasicAuth, planCredentials } from './mcp';

describe('encodeBasicAuth', () => {
	// The one header shape variable substitution cannot express, which is the
	// whole reason the agent composes it rather than the config referencing it.
	it('encodes user:secret the way HTTP Basic expects', () => {
		expect(encodeBasicAuth({ user: 'a@b.co', secret: 'tok' })).toBe(
			Buffer.from('a@b.co:tok').toString('base64')
		);
	});

	it('round-trips back to the original pair', () => {
		const encoded = encodeBasicAuth({ user: 'me@example.com', secret: 'ATATT-xyz' });

		expect(Buffer.from(encoded, 'base64').toString()).toBe('me@example.com:ATATT-xyz');
	});

	// A colon in the token must not shift the boundary — the first colon separates.
	it('keeps a colon inside the secret intact', () => {
		const encoded = encodeBasicAuth({ user: 'me@example.com', secret: 'a:b:c' });
		const decoded = Buffer.from(encoded, 'base64').toString();

		expect(decoded.slice(decoded.indexOf(':') + 1)).toBe('a:b:c');
	});

	it('handles non-ascii in either half', () => {
		const encoded = encodeBasicAuth({ user: 'aé@b.co', secret: 'tøk' });

		expect(Buffer.from(encoded, 'base64').toString()).toBe('aé@b.co:tøk');
	});
});

describe('credentialVariables', () => {
	it('lists each required variable when there is no basic auth', () => {
		expect(credentialVariables({ requires: [{ env: 'A' }, { env: 'B' }] })).toEqual(['A', 'B']);
	});

	// With basic auth the raw answers are combined and discarded, so the encoded
	// header is the only thing that lands in the env file.
	it('lists only the derived variable for a basic-auth preset', () => {
		expect(
			credentialVariables({ requires: [{ env: 'EMAIL' }, { env: 'TOKEN' }], basicAuth: { into: 'BASIC' } })
		).toEqual(['BASIC']);
	});
});

describe('planCredentials', () => {
	const isSet = (set: string[]) => (variable: string) => set.includes(variable);

	it('prompts for everything on a first install', () => {
		expect(planCredentials({ writes: ['TOKEN'], installed: false, isSet: isSet([]) })).toMatchObject({
			collision: [],
			mustPrompt: true
		});
	});

	// The guard that has to survive: a variable already owned by a different
	// server must not be silently overwritten by adding a new one.
	it('reports a collision when the variable belongs to another server', () => {
		expect(
			planCredentials({ writes: ['TOKEN'], installed: false, isSet: isSet(['TOKEN']) })
		).toMatchObject({ collision: ['TOKEN'] });
	});

	// Re-adding a server that is already configured is a deliberate update, not a
	// collision — refusing it is what made rotating a token a manual file edit.
	it('treats a re-add of an installed server as an update, not a collision', () => {
		expect(
			planCredentials({ writes: ['TOKEN'], installed: true, isSet: isSet(['TOKEN']) })
		).toMatchObject({ collision: [], mustPrompt: false });
	});

	// Nothing stored means nothing to keep, so it is asked for outright rather
	// than offering a choice with one real option.
	it('still prompts on a re-add when a variable is missing', () => {
		expect(
			planCredentials({ writes: ['A', 'B'], installed: true, isSet: isSet(['A']) })
		).toMatchObject({ collision: [], mustPrompt: true });
	});

	it('needs no prompt for a preset that requires nothing', () => {
		expect(planCredentials({ writes: [], installed: true, isSet: isSet([]) })).toMatchObject({
			collision: [],
			mustPrompt: false
		});
	});
});

describe('buildSecrets', () => {
	const preset = {
		requires: [{ env: 'EMAIL' }, { env: 'TOKEN' }],
		basicAuth: { user: 'EMAIL', secret: 'TOKEN', into: 'BASIC' }
	};

	it('encodes the answers into the derived variable', () => {
		const answers = new Map([
			['EMAIL', 'a@b.co'],
			['TOKEN', 'tok']
		]);

		expect(buildSecrets({ preset, answers, replace: true })).toEqual([
			{ variable: 'BASIC', value: encodeBasicAuth({ user: 'a@b.co', secret: 'tok' }) }
		]);
	});

	// Keeping the stored credential must write nothing at all. Composing one from
	// an empty answer set produced base64(":") and silently destroyed a working
	// token — a credential loss with a success message on it.
	it('writes nothing when the stored credential is being kept', () => {
		expect(buildSecrets({ preset, answers: new Map(), replace: false })).toEqual([]);
	});

	it('writes each answer directly when there is no basic auth', () => {
		const answers = new Map([['TOKEN', 'tok']]);

		expect(buildSecrets({ preset: { requires: [{ env: 'TOKEN' }] }, answers, replace: true })).toEqual([
			{ variable: 'TOKEN', value: 'tok' }
		]);
	});

	it('writes nothing for a preset that requires nothing', () => {
		expect(buildSecrets({ preset: { requires: [] }, answers: new Map(), replace: true })).toEqual([]);
	});
});
