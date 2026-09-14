import { describe, expect, it } from 'vitest';
import { normalizeEnvPath } from 'src/utils/env-path';

// The normalized path is joined onto a worktree and written to on the machine, so
// every accepted spelling has to stay inside the repository.
describe('normalizeEnvPath', () => {
	it.each([
		['be', 'be'],
		['/be', 'be'],
		['be/', 'be'],
		['./be', 'be'],
		['././be', 'be'],
		['  be  ', 'be'],
		['apps/web', 'apps/web'],
		['/apps/web/', 'apps/web'],
		['packages/my_pkg-2.x', 'packages/my_pkg-2.x'],
		['.env-dir', '.env-dir']
	])('normalizes %j to %j', (raw, expected) => {
		expect(normalizeEnvPath(raw)).toBe(expected);
	});

	it.each(['', '   ', '/', '//', './', '.'])('reads %j as the repository root', (raw) => {
		expect(normalizeEnvPath(raw)).toBe('.');
	});

	it.each([
		'..',
		'../x',
		'be/..',
		'be/../..',
		'a/./b',
		'a//b',
		'be\\x',
		'..\\x',
		'be\0',
		'be x',
		'be/$HOME',
		'~/be',
		'be:x'
	])('refuses %j', (raw) => {
		expect(normalizeEnvPath(raw)).toBeNull();
	});

	it('refuses a path longer than 200 characters', () => {
		expect(normalizeEnvPath('a'.repeat(200))).toBe('a'.repeat(200));
		expect(normalizeEnvPath('a'.repeat(201))).toBeNull();
	});

	// The agent normalizes what bosun sends it again, so bosun's output must come
	// back unchanged.
	it.each(['be', '/apps/web/', './be', '/'])('is idempotent for %j', (raw) => {
		const once = normalizeEnvPath(raw);

		expect(once).not.toBeNull();
		expect(normalizeEnvPath(once!)).toBe(once);
	});
});
