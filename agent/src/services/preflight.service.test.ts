import { describe, expect, it } from 'vitest';
import { claudeVersionIsSupported, isAtLeastMinNode } from './preflight.service';

describe('isAtLeastMinNode', () => {
	it.each([
		['v24.15.0', true],
		['v24.16.0', true],
		['v25.0.0', true],
		['v24.14.9', false],
		['v22.20.0', false],
		['24.15.0', true]
	])('%s -> %s', (version, expected) => {
		expect(isAtLeastMinNode(version)).toBe(expected);
	});
});

describe('claudeVersionIsSupported', () => {
	it.each([
		['2.1.39 (Claude Code)', true],
		['3.0.0', true],
		['1.9.9', false]
	])('%s -> %s', (version, expected) => {
		expect(claudeVersionIsSupported(version)).toBe(expected);
	});
});
