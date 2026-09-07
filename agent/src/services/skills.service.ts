import fs from 'fs';
import os from 'os';
import path from 'path';

export type SkillSource = 'project' | 'user';

export interface DiscoveredSkill {
	name: string;
	source: SkillSource;
}

const SKILLS_DIR = path.join('.claude', 'skills');
const SKILL_FILE = 'SKILL.md';

// A directory without a SKILL.md is not a skill, so it is not reported as one.
// Claude Code discovers these itself; this only mirrors that discovery so the
// browser can show what a machine actually picked up.
export function listSkillsIn(root: string): string[] {
	const dir = path.join(root, SKILLS_DIR);

	let entries: fs.Dirent[];

	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((name) => fs.existsSync(path.join(dir, name, SKILL_FILE)))
		.sort();
}

// A project skill shadows a user skill of the same name, so the machine reports
// the one that will actually run rather than both.
export function mergeSkills(opts: { project: string[]; user: string[] }): DiscoveredSkill[] {
	const project = opts.project.map((name) => ({ name, source: 'project' as const }));
	const shadowed = new Set(opts.project);
	const user = opts.user
		.filter((name) => !shadowed.has(name))
		.map((name) => ({ name, source: 'user' as const }));

	return [...project, ...user];
}

export function getSkillsService(deps: { repoPath: string; homeDir?: string }) {
	return {
		list(): DiscoveredSkill[] {
			return mergeSkills({
				project: listSkillsIn(deps.repoPath),
				user: listSkillsIn(deps.homeDir ?? os.homedir())
			});
		}
	};
}

export type SkillsService = ReturnType<typeof getSkillsService>;
