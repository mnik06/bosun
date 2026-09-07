import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSkillsService, listSkillsIn, mergeSkills } from './skills.service';

let root: string;

function writeSkill(opts: { root: string; name: string; withFile?: boolean }): void {
	const dir = path.join(opts.root, '.claude', 'skills', opts.name);

	fs.mkdirSync(dir, { recursive: true });

	if (opts.withFile !== false) {
		fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: x\n---\n');
	}
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-skills-'));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('listSkillsIn', () => {
	it('finds skills and returns them sorted', () => {
		writeSkill({ root, name: 'zeta' });
		writeSkill({ root, name: 'alpha' });

		expect(listSkillsIn(root)).toEqual(['alpha', 'zeta']);
	});

	// A directory without SKILL.md is not a skill Claude Code will load, so
	// reporting it would tell the operator a skill is present when it is not.
	it('ignores a directory with no SKILL.md', () => {
		writeSkill({ root, name: 'real' });
		writeSkill({ root, name: 'empty', withFile: false });

		expect(listSkillsIn(root)).toEqual(['real']);
	});

	it('returns nothing when there is no .claude/skills at all', () => {
		expect(listSkillsIn(root)).toEqual([]);
		expect(listSkillsIn(path.join(root, 'does-not-exist'))).toEqual([]);
	});
});

describe('mergeSkills', () => {
	it('labels each skill with where it came from', () => {
		expect(mergeSkills({ project: ['a'], user: ['b'] })).toEqual([
			{ name: 'a', source: 'project' },
			{ name: 'b', source: 'user' }
		]);
	});

	// The machine has to report the skill that will actually run, not both.
	it('lets a project skill shadow a user skill of the same name', () => {
		expect(mergeSkills({ project: ['review'], user: ['review', 'other'] })).toEqual([
			{ name: 'review', source: 'project' },
			{ name: 'other', source: 'user' }
		]);
	});

	it('handles both sides being empty', () => {
		expect(mergeSkills({ project: [], user: [] })).toEqual([]);
	});
});

describe('getSkillsService', () => {
	it('reads the repo and the home directory', () => {
		const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bosun-home-'));

		writeSkill({ root, name: 'plan-conventions' });
		writeSkill({ root: home, name: 'operator-tools' });

		expect(getSkillsService({ repoPath: root, homeDir: home }).list()).toEqual([
			{ name: 'plan-conventions', source: 'project' },
			{ name: 'operator-tools', source: 'user' }
		]);

		fs.rmSync(home, { recursive: true, force: true });
	});
});
