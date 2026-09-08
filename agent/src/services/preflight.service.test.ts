import { describe, expect, it } from 'vitest';
import { claudeVersionIsSupported } from './preflight.service';

describe('claudeVersionIsSupported', () => {
	it.each([
		['2.1.39 (Claude Code)', true],
		['3.0.0', true],
		['1.9.9', false]
	])('%s -> %s', (version, expected) => {
		expect(claudeVersionIsSupported(version)).toBe(expected);
	});
});
