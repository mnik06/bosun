import { describeIssues, parseProjectConfig, type ProjectConfig } from '../project-config';
import { inferConfig } from './config-inference';

export type ResolvedConfig =
	| { source: 'config'; config: ProjectConfig }
	| { source: 'none' }
	| { source: 'invalid'; detail: string };

// A single source: whatever config text bosun sent on the frame that started
// this session. No tree file is ever read, so there is no precedence to choose
// between — a repository with no config yet is `'none'`, and one whose text
// does not validate is `'invalid'` rather than falling back to anything. Given
// the tree it will run in, whatever the text leaves out (ports, env wiring,
// readiness) is inferred from that tree.
export function resolveProjectConfig(config: string | null, worktreePath?: string): ResolvedConfig {
	if (config === null) {
		return { source: 'none' };
	}

	const parsed = parseProjectConfig(config);

	return parsed.ok
		? { source: 'config', config: worktreePath === undefined ? parsed.config : inferConfig(parsed.config, worktreePath) }
		: { source: 'invalid', detail: `the repository's config is invalid — ${describeIssues(parsed.issues)}` };
}
