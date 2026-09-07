import { describe, expect, it } from 'vitest';
import { toQueueSlug } from 'src/types/QueueSchema';

describe('toQueueSlug', () => {
	it.each([
		['Auth work', 'auth-work'],
		['  Padded  ', 'padded'],
		['UPPER/case', 'upper-case'],
		['emoji 🚀 gone', 'emoji-gone'],
		['a...b', 'a-b']
	])('%j -> %j', (name, expected) => {
		expect(toQueueSlug(name)).toBe(expected);
	});

	// The slug becomes a directory and a branch, so anything git or a filesystem
	// would argue with has to be gone rather than escaped at each use.
	it('leaves nothing but lowercase, digits and single dashes', () => {
		expect(toQueueSlug('Fix: the #1 thing (again)!')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});

	it('is empty when there was nothing usable to keep', () => {
		expect(toQueueSlug('***')).toBe('');
	});

	it('stays short enough to be a path segment', () => {
		expect(toQueueSlug('x'.repeat(200)).length).toBe(40);
	});
});
