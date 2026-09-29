import { describeIssues, parseProjectConfig, type ProjectConfig } from '../project-config';

export type ResolvedConfig =
	| { source: 'config'; config: ProjectConfig }
	| { source: 'none' }
	| { source: 'invalid'; detail: string };

// A single source: whatever config text bosun sent on the frame that started
// this session. No tree file is ever read, so there is no precedence to choose
// between — a repository with no config yet is `'none'`, and one whose text
// does not validate is `'invalid'` rather than falling back to anything.
export function resolveProjectConfig(config: string | null): ResolvedConfig {
	if (config === null) {
		return { source: 'none' };
	}

	const parsed = parseProjectConfig(config);

	return parsed.ok
		? { source: 'config', config: parsed.config }
		: { source: 'invalid', detail: `the repository's config is invalid — ${describeIssues(parsed.issues)}` };
}
