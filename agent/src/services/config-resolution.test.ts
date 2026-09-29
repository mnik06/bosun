import { describe, expect, it } from 'vitest';
import { resolveProjectConfig } from './config-resolution';

describe('resolveProjectConfig', () => {
	it('is none for a repository with no config yet', () => {
		expect(resolveProjectConfig(null)).toEqual({ source: 'none' });
	});

	it('parses the config text bosun sent', () => {
		const resolved = resolveProjectConfig('Notes:\nfrom bosun\n');

		expect(resolved.source === 'config' && resolved.config.notes).toBe('from bosun\n');
	});

	it('is invalid rather than falling back to anything, when the text does not validate', () => {
		expect(resolveProjectConfig('Apps:\nbe:\n- Cwd: be\n')).toEqual({
			source: 'invalid',
			detail: expect.stringContaining("the repository's config is invalid")
		});
	});
});
