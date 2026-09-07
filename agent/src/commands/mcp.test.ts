import { describe, expect, it } from 'vitest';
import { encodeBasicAuth } from './mcp';

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
