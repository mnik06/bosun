import { describe, expect, it } from 'vitest';
import { readBearerToken } from 'src/utils/general';

describe('readBearerToken', () => {
	it('returns the token from a well-formed header', () => {
		expect(readBearerToken('Bearer abc.def')).toBe('abc.def');
	});

	it('returns null when the header is absent', () => {
		expect(readBearerToken(undefined)).toBeNull();
	});

	it('returns null for a scheme it does not recognise', () => {
		expect(readBearerToken('Basic abc')).toBeNull();
		expect(readBearerToken('bearer abc')).toBeNull();
	});

	it('returns null rather than an empty token', () => {
		expect(readBearerToken('Bearer ')).toBeNull();
		expect(readBearerToken('Bearer    ')).toBeNull();
	});
});
