import { describe, expect, it } from 'vitest';
import { findPrUrl } from './publish';

describe('findPrUrl', () => {
	it('reads the url gh prints on success', () => {
		expect(findPrUrl('https://github.com/o/r/pull/42\n')).toBe('https://github.com/o/r/pull/42');
	});

	// Re-running a plan pushes the same branch again, and gh reports the existing
	// pull request as an error. That is the URL bosun wants, not a failure.
	it('reads the url out of the already-exists complaint', () => {
		const said =
			'a pull request for branch "bosun/q/p_1" into branch "main" already exists:\nhttps://github.com/o/r/pull/7';

		expect(findPrUrl(said)).toBe('https://github.com/o/r/pull/7');
	});

	it('finds nothing when gh said nothing useful', () => {
		expect(findPrUrl('could not create pull request')).toBeNull();
	});

	// A compare link is not a pull request; treating one as the answer would show
	// a PR in the browser that nobody ever opened.
	it('does not mistake a compare link for a pull request', () => {
		expect(findPrUrl('https://github.com/o/r/compare/main...topic')).toBeNull();
	});
});
