import { describe, expect, it } from 'vitest';
import { GitBranchNameSchema } from 'src/types/RepositorySchema';

// The name reaches `git` on the machine as an argument.
describe('GitBranchNameSchema', () => {
	it.each(['develop', 'release/2026.09', 'feature/abc_1-x'])('accepts %s', (name) => {
		expect(GitBranchNameSchema.safeParse(name).success).toBe(true);
	});

	it.each(['--upload-pack=x', '-b', '/main', 'main/', 'main.lock', 'a..b', 'a//b', 'has space', 'a~1', 'a:b', ''])('refuses %s', (name) => {
		expect(GitBranchNameSchema.safeParse(name).success).toBe(false);
	});
});
