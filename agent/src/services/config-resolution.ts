import fs from 'fs';
import path from 'path';
import {
	describeIssues,
	parseProjectConfig,
	PROJECT_CONFIG_PATH,
	type ProjectConfig
} from '../project-config';

export type ResolvedConfig =
	| { source: 'file' | 'draft'; config: ProjectConfig }
	| { source: 'none' }
	| { source: 'invalid'; origin: 'file' | 'draft'; detail: string };

// Resolution is by presence, not precedence. The tree's own file wins whenever it
// exists — valid or not. A broken file never falls back to the draft: that would
// run a branch against a config the branch no longer matches, and fail somewhere
// far less legible than here.
//
// `preferDraft` is onboarding's verify after a discovery, and nothing else: it
// proves the config discovery proposed, which on a repository that already has
// the file is a change to that file rather than the file itself.
export function resolveProjectConfig(opts: {
	treePath: string;
	draft: string | null;
	preferDraft?: boolean;
}): ResolvedConfig {
	const file = path.join(opts.treePath, PROJECT_CONFIG_PATH);
	let source: string | null = null;

	if (opts.preferDraft && opts.draft !== null) {
		return fromDraft(opts.draft);
	}

	try {
		source = fs.readFileSync(file, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			return { source: 'invalid', origin: 'file', detail: `${PROJECT_CONFIG_PATH} could not be read` };
		}
	}

	if (source !== null) {
		const parsed = parseProjectConfig(source);

		return parsed.ok
			? { source: 'file', config: parsed.config }
			: { source: 'invalid', origin: 'file', detail: `${PROJECT_CONFIG_PATH} is invalid — ${describeIssues(parsed.issues)}` };
	}

	return opts.draft === null ? { source: 'none' } : fromDraft(opts.draft);
}

function fromDraft(draft: string): ResolvedConfig {
	const parsed = parseProjectConfig(draft);

	return parsed.ok
		? { source: 'draft', config: parsed.config }
		: { source: 'invalid', origin: 'draft', detail: `the repository's draft config is invalid — ${describeIssues(parsed.issues)}` };
}
